#!/usr/bin/env node
/**
 * Drip-send an email to CRM leads one by one with a configurable delay.
 *
 * Safety defaults:
 *   - Dry-run unless you pass --send
 *   - Skips invalid/missing emails
 *   - Maintains a JSONL send log and skips addresses already logged as sent
 *   - Supports --limit and --test-to before a full campaign
 *
 * Usage:
 *   node scripts/email-leads-drip.mjs --dry-run --limit 5
 *   node scripts/email-leads-drip.mjs --send --test-to you@example.com
 *   node scripts/email-leads-drip.mjs --send --delay-minutes 7
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')

loadEnvFiles([
  '.env.local',
  '.env.production.local',
  '.env.production',
  'whatsapp-agent/.env',
])

const args = parseArgs(process.argv.slice(2))
const dryRun = !args.send || Boolean(args['dry-run'])
const delayMinutes = Number(args['delay-minutes'] ?? 7)
const delayMs = Math.max(0, delayMinutes) * 60 * 1000
const limit = args.limit ? Number(args.limit) : undefined
const testTo = args['test-to'] ? String(args['test-to']) : ''
const subjectTemplate = String(args.subject ?? 'Introducing Emergize to {{companyName}}')
const bodyFile = String(args['body-file'] ?? 'templates/lead-email.txt')
const logFile = resolve(PROJECT_ROOT, String(args['log-file'] ?? 'tmp/lead-email-drip-log.jsonl'))
const profileQuery = String(args['profile-query'] ?? 'Emergize profile')
// Default to the canonical company-profile PDF in the agency-files bucket so
// `node email-leads-drip.mjs --send` works without remembering the long URL.
// Override with --profile-url or --profile-path if you need a different file.
const DEFAULT_PROFILE_URL = 'https://ddiaetxjjsobwkrapxnt.supabase.co/storage/v1/object/public/agency-files/36d326b9-5842-4191-a720-97d1d63fe89a/1778681405167-Emergize-profile-1-.pdf'
const profileUrl = args['profile-url'] ? String(args['profile-url']) : (process.env.EMERGIZE_PROFILE_URL || DEFAULT_PROFILE_URL)
const profilePath = args['profile-path'] ? resolve(PROJECT_ROOT, String(args['profile-path'])) : ''
const skipProfile = Boolean(args['skip-profile'])

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const resendApiKey = process.env.RESEND_API_KEY
const resendFrom = process.env.RESEND_FROM || 'Emergize Agent <info@emergize-sa.com>'
const resendFallbackFrom = process.env.RESEND_FALLBACK_FROM || 'Emergize Agent <onboarding@resend.dev>'

if (!supabaseUrl || !supabaseKey) die('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
if (!resendApiKey && !dryRun) die('Missing RESEND_API_KEY')
if (!Number.isFinite(delayMinutes) || delayMinutes < 0) die('--delay-minutes must be a non-negative number')

const bodyTemplate = readFileSync(resolve(PROJECT_ROOT, bodyFile), 'utf8')
const alreadySent = readSentEmails(logFile)
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
let companyProfileAttachment = null

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err))
  process.exitCode = 1
})

async function main() {
  companyProfileAttachment = skipProfile ? null : await resolveCompanyProfileAttachment()

  if (!companyProfileAttachment) {
    console.warn('Company profile attachment not found. Add it to client_files with “profile” in the name, or pass --profile-url / --profile-path. Continuing without attachment.')
  } else {
    console.log(`Company profile: ${companyProfileAttachment.filename}`)
  }

  const { data, error } = await supabase
    .from('clients')
    .select('id, full_name, company_name, email, status, last_contacted_at')
    .eq('status', 'lead')
    .not('email', 'is', null)
    .order('created_at', { ascending: true })

  if (error) throw error

  const queuedEmails = new Set()
  let leads = (data || [])
    .map((lead) => ({ ...lead, email: normalizeEmail(lead.email) }))
    .filter((lead) => isValidEmail(lead.email))
    .filter((lead) => !alreadySent.has(lead.email.toLowerCase()))
    .filter((lead) => {
      const key = lead.email.toLowerCase()
      if (queuedEmails.has(key)) return false
      queuedEmails.add(key)
      return true
    })

  if (testTo) {
    leads = leads.slice(0, 1).map((lead) => ({ ...lead, email: normalizeEmail(testTo), original_email: lead.email }))
  }
  if (limit) leads = leads.slice(0, limit)

  console.log(`${dryRun ? 'DRY RUN' : 'SEND MODE'}: ${leads.length} lead email(s) queued.`)
  console.log(`Delay: ${delayMinutes} minute(s). Template: ${bodyFile}. Log: ${relative(logFile)}`)
  console.log(`Attachment: ${companyProfileAttachment ? companyProfileAttachment.filename : 'none'}`)

  if (dryRun) {
    leads.slice(0, 10).forEach((lead, index) => {
      console.log(`${index + 1}. ${lead.company_name} <${lead.email}> — subject: ${render(subjectTemplate, lead)}`)
    })
    if (leads.length > 10) console.log(`...and ${leads.length - 10} more`)
    console.log('Dry-run only. Add --send to actually send.')
    return
  }

  mkdirSync(dirname(logFile), { recursive: true })

  for (let i = 0; i < leads.length; i += 1) {
    const lead = leads[i]
    const subject = render(subjectTemplate, lead)
    const text = render(bodyTemplate, lead)

    console.log(`[${i + 1}/${leads.length}] Sending to ${lead.company_name} <${lead.email}>`)
    const result = await sendViaResend({
      to: lead.email,
      subject,
      text,
      from: resendFrom,
      attachments: companyProfileAttachment ? [companyProfileAttachment] : [],
    })

    appendFileSync(logFile, JSON.stringify({
      at: new Date().toISOString(),
      client_id: lead.id,
      company_name: lead.company_name,
      email: lead.email,
      original_email: lead.original_email,
      subject,
      ok: result.ok,
      provider_id: result.id,
      error: result.error,
    }) + '\n')

    if (!result.ok) {
      console.error(`Failed: ${result.error}`)
    }

    if (i < leads.length - 1 && delayMs > 0) {
      const nextAt = new Date(Date.now() + delayMs).toLocaleTimeString()
      console.log(`Waiting ${delayMinutes} minute(s). Next send around ${nextAt}.`)
      await sleep(delayMs)
    }
  }

  console.log('Done.')
}

async function sendViaResend({ to, subject, text, from, attachments = [] }) {
  const first = await resendRequest({ to, subject, text, from, attachments })
  if (first.ok || from === resendFallbackFrom || first.status !== 403) return first

  console.warn('Primary sender rejected by Resend; retrying with fallback sender.')
  return resendRequest({ to, subject, text, from: resendFallbackFrom, attachments })
}

async function resendRequest({ to, subject, text, from, attachments = [] }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html: textToHtml(text),
        attachments,
        // List-Unsubscribe headers — Outlook + Gmail strongly prefer mail
        // with both forms (mailto + one-click). Cuts junk-folder rate.
        headers: {
          'List-Unsubscribe': `<mailto:${EMAIL_SIGNATURE.contactEmail}?subject=Unsubscribe>, <https://emergize-sa.com/unsubscribe?email=${encodeURIComponent(to)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    })

    const payloadText = await res.text()
    let payload = null
    try { payload = payloadText ? JSON.parse(payloadText) : null } catch {}

    if (!res.ok) {
      return { ok: false, status: res.status, error: `Resend ${res.status}: ${payloadText.slice(0, 500)}` }
    }
    return { ok: true, status: res.status, id: payload?.id }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

function render(template, lead) {
  const fullName = clean(lead.full_name) || 'there'
  const firstName = fullName.split(/\s+/)[0] || 'there'
  const companyName = clean(lead.company_name) || 'your company'

  return template
    .replaceAll('{{fullName}}', fullName)
    .replaceAll('{{firstName}}', firstName)
    .replaceAll('{{companyName}}', companyName)
    .replaceAll('{{email}}', lead.email || '')
}

async function resolveCompanyProfileAttachment() {
  if (profilePath) return attachmentFromFile(profilePath)
  if (profileUrl) return attachmentFromUrl(profileUrl, 'Emergize Company Profile.pdf')

  const { data, error } = await supabase
    .from('client_files')
    .select('name, file_path, file_type')
    .or(`name.ilike.%${escapeSupabaseLike(profileQuery)}%,file_path.ilike.%${escapeSupabaseLike(profileQuery)}%,name.ilike.%profile%,name.ilike.%emergize%,file_path.ilike.%profile%,file_path.ilike.%emergize%`)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.warn(`Could not look up company profile in client_files: ${error.message}`)
    return null
  }

  const file = data?.[0]
  if (!file?.file_path) return null
  return attachmentFromUrl(file.file_path, file.name || 'Emergize Company Profile.pdf')
}

async function attachmentFromFile(pathToFile) {
  const content = readFileSync(pathToFile).toString('base64')
  return { filename: basename(pathToFile), content }
}

async function attachmentFromUrl(url, fallbackFilename) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch company profile: ${res.status} ${await res.text()}`)
  const content = Buffer.from(await res.arrayBuffer()).toString('base64')
  return { filename: filenameFromUrl(url) || fallbackFilename, content }
}

function filenameFromUrl(url) {
  try {
    const parsed = new URL(url)
    const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '')
    return name || ''
  } catch {
    return ''
  }
}

function escapeSupabaseLike(value) {
  return String(value).replaceAll('%', '\\%').replaceAll('_', '\\_').replaceAll(',', '\\,')
}

// =============================================================================
// Branded Emergize signature — mirrors whatsapp-agent/src/tools/executors.js
// buildSignatureHtml() so EVERY outbound email from the system looks the same:
// the actual logo PNG, real social icons, real contact info.
// =============================================================================

const EMAIL_SIGNATURE = {
  logoUrl: process.env.EMAIL_LOGO_URL
    || 'https://ddiaetxjjsobwkrapxnt.supabase.co/storage/v1/object/public/agency-files/brand/emergize-logo.png',
  instagramIcon: 'https://ddiaetxjjsobwkrapxnt.supabase.co/storage/v1/object/public/agency-files/brand/instagram-icon-v3.png',
  tiktokIcon: 'https://ddiaetxjjsobwkrapxnt.supabase.co/storage/v1/object/public/agency-files/brand/tiktok-icon.png',
  websiteUrl: process.env.EMAIL_WEBSITE_URL || 'https://emergize-sa.com',
  instagramUrl: 'https://www.instagram.com/emergize_sa',
  tiktokUrl: 'https://www.tiktok.com/@emergize1',
  contactEmail: 'info@emergize-sa.com',
  contactPhone: '+966 57 760 2467',
  contactPhoneIntl: '+966577602467',
  tagline: 'Emerge to Dominate',
}

function textToHtml(text) {
  const bodyHtml = escapeHtml(text).replace(/\n/g, '<br>')
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1a1a1a;line-height:1.55;">
<div style="max-width:600px;margin:0 auto;padding:24px;">
  <div style="font-size:14.5px;color:#1a1a1a;">${bodyHtml}</div>

  <div style="margin-top:32px;padding-top:20px;border-top:2px solid #9DCD3D;">
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td style="padding-right:18px;vertical-align:middle;">
          <img src="${EMAIL_SIGNATURE.logoUrl}" alt="Emergize" width="120" style="display:block;width:120px;height:auto;border:0;" />
        </td>
        <td style="vertical-align:middle;font-family:Inter,Segoe UI,Arial,sans-serif;">
          <div style="font-weight:700;font-size:13px;color:#0a0a0a;letter-spacing:0.5px;text-transform:uppercase;">EMERGIZE</div>
          <div style="font-size:11.5px;color:#9DCD3D;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">${EMAIL_SIGNATURE.tagline}</div>
          <div style="margin-top:8px;font-size:12.5px;color:#444;line-height:1.7;">
            <a href="tel:${EMAIL_SIGNATURE.contactPhoneIntl}" style="color:#444;text-decoration:none;">${EMAIL_SIGNATURE.contactPhone}</a><br>
            <a href="mailto:${EMAIL_SIGNATURE.contactEmail}" style="color:#444;text-decoration:none;">${EMAIL_SIGNATURE.contactEmail}</a><br>
            <a href="${EMAIL_SIGNATURE.websiteUrl}" style="color:#444;text-decoration:none;">${EMAIL_SIGNATURE.websiteUrl.replace(/^https?:\/\//, '')}</a>
          </div>
          <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:10px;">
            <tr>
              <td style="padding-right:10px;">
                <a href="${EMAIL_SIGNATURE.instagramUrl}" style="text-decoration:none;display:inline-block;">
                  <img src="${EMAIL_SIGNATURE.instagramIcon}" alt="Instagram" width="28" height="28" style="display:block;width:28px;height:28px;border:0;" />
                </a>
              </td>
              <td>
                <a href="${EMAIL_SIGNATURE.tiktokUrl}" style="text-decoration:none;display:inline-block;">
                  <img src="${EMAIL_SIGNATURE.tiktokIcon}" alt="TikTok" width="28" height="28" style="display:block;width:28px;height:28px;border:0;" />
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</div>
</body></html>`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function readSentEmails(pathToLog) {
  const sent = new Set()
  if (!existsSync(pathToLog)) return sent

  for (const line of readFileSync(pathToLog, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      if (row.ok && row.email) sent.add(String(row.email).toLowerCase())
    } catch {}
  }
  return sent
}

function parseArgs(argv) {
  const parsed = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) parsed[key] = true
    else {
      parsed[key] = next
      i += 1
    }
  }
  return parsed
}

function loadEnvFiles(files) {
  for (const file of files) {
    const fullPath = resolve(PROJECT_ROOT, file)
    if (!existsSync(fullPath)) continue
    const content = readFileSync(fullPath, 'utf8')
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key]) continue
      process.env[key] = unquoteEnv(rawValue.trim())
    }
  }
}

function unquoteEnv(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function normalizeEmail(email) {
  return String(email || '').trim().replace(/^mailto:/i, '')
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function clean(value) {
  return String(value || '').trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function relative(pathToFile) {
  return pathToFile.replace(PROJECT_ROOT + '\\', '').replace(PROJECT_ROOT + '/', '')
}

function die(message) {
  console.error(message)
  process.exit(1)
}
