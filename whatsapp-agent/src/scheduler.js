import fs from 'node:fs/promises'
import path from 'node:path'
import { supabase } from './supabase.js'

// Polls the reminders table every POLL_INTERVAL_MS. When a pending reminder's
// due_date + due_time is <= "now in the user's timezone", sends a WhatsApp
// message and records the id in fired_reminders.json so restarts don't
// double-send. Stale reminders (>GRACE_PERIOD_MS past due) are silently
// marked fired to avoid spamming the user on first boot after a long absence.

const POLL_INTERVAL_MS = 30_000
const GRACE_PERIOD_SECONDS = 24 * 60 * 60 // 24h
const DEFAULT_TIME = '09:00:00'
const FIRED_FILE = path.join('./baileys_auth', 'fired_reminders.json')
const FIRED_NOTIFS_FILE = path.join('./baileys_auth', 'fired_notifications.json')
// Single dedupe file for the new date-anchored event ticks (contracts,
// weekly reports, content publish dates). Each entry is a string of the
// form `<kind>-<id>` so different kinds can't collide.
const FIRED_EVENTS_FILE = path.join('./baileys_auth', 'fired_events.json')
// How many days ahead of an end_date the contract tick should warn. KSA
// agencies typically want a 7-day heads-up to start the renewal convo.
const CONTRACT_END_LEAD_DAYS = 7

let firedSet = new Set()
let firedNotifSet = new Set()
let firedEventSet = new Set()
let started = false

async function loadFired() {
  try {
    const data = await fs.readFile(FIRED_FILE, 'utf-8')
    const arr = JSON.parse(data)
    if (Array.isArray(arr)) firedSet = new Set(arr)
  } catch {
    // first run — file doesn't exist yet
  }
  try {
    const data = await fs.readFile(FIRED_NOTIFS_FILE, 'utf-8')
    const arr = JSON.parse(data)
    if (Array.isArray(arr)) firedNotifSet = new Set(arr)
  } catch {
    // first run
  }
  try {
    const data = await fs.readFile(FIRED_EVENTS_FILE, 'utf-8')
    const arr = JSON.parse(data)
    if (Array.isArray(arr)) firedEventSet = new Set(arr)
  } catch {
    // first run
  }
}

async function saveFiredEvents() {
  try {
    await fs.mkdir(path.dirname(FIRED_EVENTS_FILE), { recursive: true })
    await fs.writeFile(FIRED_EVENTS_FILE, JSON.stringify([...firedEventSet]))
  } catch (err) {
    console.error('[scheduler] save fired events list failed:', err?.message ?? err)
  }
}

async function saveFired() {
  try {
    await fs.mkdir(path.dirname(FIRED_FILE), { recursive: true })
    await fs.writeFile(FIRED_FILE, JSON.stringify([...firedSet]))
  } catch (err) {
    console.error('[scheduler] save fired list failed:', err?.message ?? err)
  }
}

async function saveFiredNotifs() {
  try {
    await fs.mkdir(path.dirname(FIRED_NOTIFS_FILE), { recursive: true })
    await fs.writeFile(FIRED_NOTIFS_FILE, JSON.stringify([...firedNotifSet]))
  } catch (err) {
    console.error('[scheduler] save fired notifs list failed:', err?.message ?? err)
  }
}

// "YYYY-MM-DD HH:MM:SS" formatted in the given IANA timezone.
function nowInTimezone(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '00'
  // Intl returns '24' for midnight in some locales/browsers — normalize.
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`
}

// Seconds between two "YYYY-MM-DD HH:MM:SS" strings. Treats both as UTC so
// the ABSOLUTE value is wrong but the DIFFERENCE is correct (both strings
// are in the same timezone, so the shift cancels out).
function diffSeconds(a, b) {
  const toMs = (s) => Date.parse(s.replace(' ', 'T') + 'Z')
  return (toMs(a) - toMs(b)) / 1000
}

function formatReminderMessage(r, timeStr) {
  const icon = r.priority === 'high' ? '🚨' : '🔔'
  let msg = `${icon} Reminder: ${r.title}`
  if (r.description) msg += `\n\n${r.description}`
  if (timeStr) msg += `\n\n(scheduled for ${r.due_date} ${timeStr})`
  return msg
}

async function tick(sock, notifyJids, tz) {
  const nowStr = nowInTimezone(tz)
  const today = nowStr.slice(0, 10)

  const { data, error } = await supabase
    .from('reminders')
    .select('id, title, description, due_date, due_time, priority, status, notify_jid')
    .eq('status', 'pending')
    .lte('due_date', today)

  if (error) {
    console.error('[scheduler] query failed:', error.message)
    return
  }
  if (!data || data.length === 0) return

  const fallbackJid = notifyJids[0]

  for (const r of data) {
    if (firedSet.has(r.id)) continue

    const timeStr = r.due_time ?? DEFAULT_TIME
    const dueStr = `${r.due_date} ${timeStr.length === 5 ? timeStr + ':00' : timeStr}`

    if (dueStr > nowStr) continue // not due yet

    const ageSec = diffSeconds(nowStr, dueStr)
    if (ageSec > GRACE_PERIOD_SECONDS) {
      // Too stale — suppress silently.
      firedSet.add(r.id)
      continue
    }

    // Per-reminder routing: if we know who created it (notify_jid set when
    // the WhatsApp executor inserted the row), send to that user. Otherwise
    // fall back to user 1 — preserves existing behaviour for legacy rows
    // and for reminders the dashboard creates.
    const target = r.notify_jid && notifyJids.includes(r.notify_jid)
      ? r.notify_jid
      : (r.notify_jid || fallbackJid)

    const body = formatReminderMessage(r, r.due_time ? timeStr.slice(0, 5) : null)
    try {
      await sock.sendMessage(target, { text: body })
      firedSet.add(r.id)
      await saveFired()
      console.log(`[scheduler] fired reminder ${r.id} → ${target}: ${r.title}`)
    } catch (err) {
      console.error(`[scheduler] send failed for ${r.id}:`, err?.message ?? err)
    }
  }
}

// =============================================================================
// Notifications-table delivery — fires WhatsApp messages for in-app notifications
// =============================================================================
// When the dashboard inserts a notifications row with a user_id (e.g., on task
// assignment), look up that user's WhatsApp number on team_members.whatsapp
// (or .phone) and ping them. Tracks fired ids in fired_notifications.json so
// restarts / reconnects don't double-send.
//
// Notifications with user_id = null are admin-broadcast (e.g. "task completed
// by staff"). For those we send to the first configured notify JID (User 1).

function jidFromPhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length < 7) return null
  return `${digits}@s.whatsapp.net`
}

function formatNotification(n) {
  const icon =
    n.type === 'task_assigned' ? '📋'
      : n.type === 'task_completed' ? '✅'
      : n.type === 'contract_alert' ? '📄'
      : '🔔'
  let body = `${icon} ${n.title || 'Notification'}`
  if (n.message) body += `\n\n${n.message}`
  return body
}

async function tickNotifications(sock, notifyJids) {
  // Pull recent unread notifications. We rely on the dashboard's existing
  // schema: id, user_id (nullable), title, message, type, is_read, created_at.
  const cutoff = new Date(Date.now() - GRACE_PERIOD_SECONDS * 1000).toISOString()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, title, message, type, is_read, created_at')
    .eq('is_read', false)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(50)
  if (error) {
    // Table may not have all these columns yet — silent return is fine
    if (!String(error.message).toLowerCase().includes('column')) {
      console.error('[scheduler/notif] query failed:', error.message)
    }
    return
  }
  if (!data || data.length === 0) return

  const fallbackJid = notifyJids[0]

  for (const n of data) {
    if (firedNotifSet.has(n.id)) continue

    let target = null
    if (n.user_id) {
      // Resolve auth user → team_member.whatsapp/phone → JID
      const { data: tm } = await supabase
        .from('team_members')
        .select('whatsapp, phone, full_name')
        .eq('user_id', n.user_id)
        .maybeSingle()
      const jid = jidFromPhone(tm?.whatsapp || tm?.phone)
      // Only send if we resolved a phone AND the JID matches one of our
      // notify JIDs (i.e., the staff member is actually one of the
      // allowed users with WhatsApp linked). Otherwise skip — we don't
      // want to spam unverified numbers from agent ToS perspective.
      if (jid && notifyJids.includes(jid)) {
        target = jid
      } else {
        // Fall back to admin (notifyJids[0]) so the message isn't lost
        target = fallbackJid
      }
    } else {
      // Admin-broadcast — send to user 1
      target = fallbackJid
    }

    if (!target) {
      firedNotifSet.add(n.id)
      continue
    }

    const body = formatNotification(n)
    try {
      await sock.sendMessage(target, { text: body })
      firedNotifSet.add(n.id)
      await saveFiredNotifs()
      console.log(`[scheduler/notif] fired ${n.id} → ${target}: ${n.title}`)
    } catch (err) {
      console.error(`[scheduler/notif] send failed for ${n.id}:`, err?.message ?? err)
    }
  }
}

// =============================================================================
// Date-anchored events. Polls contracts / weekly_reports / content_items
// and fires WhatsApp pings when a date arrives. Routing:
//   - weekly reports + content items: via assignee_id → team_members.whatsapp
//   - contracts: admin (no per-contract owner field)
// Dedupes via firedEventSet using `<kind>-<id>` keys, so e.g. a contract's
// start_date fires once even if the agent restarts.
// =============================================================================

// Look up an assignee's WhatsApp JID from team_members.id. Returns the
// fallback admin JID if the assignee has no phone on file or it's not in
// the agent's allowlist.
async function resolveAssigneeJid(assigneeId, notifyJids) {
  const fallbackJid = notifyJids[0]
  if (!assigneeId) return fallbackJid
  const { data: tm } = await supabase
    .from('team_members')
    .select('whatsapp, phone')
    .eq('id', assigneeId)
    .maybeSingle()
  const jid = jidFromPhone(tm?.whatsapp || tm?.phone)
  return jid && notifyJids.includes(jid) ? jid : fallbackJid
}

async function fireEvent(sock, target, body, dedupeKey, label) {
  try {
    await sock.sendMessage(target, { text: body })
    firedEventSet.add(dedupeKey)
    await saveFiredEvents()
    console.log(`[scheduler/events] fired ${label} → ${target}`)
  } catch (err) {
    console.error(`[scheduler/events] send failed for ${label}:`, err?.message ?? err)
  }
}

// Contracts: fires once on start_date and once when end_date is within
// CONTRACT_END_LEAD_DAYS. Routed to admin.
async function tickContractDates(sock, notifyJids, today) {
  const fallbackJid = notifyJids[0]
  if (!fallbackJid) return
  const inAWeek = new Date(today + 'T00:00:00Z')
  inAWeek.setUTCDate(inAWeek.getUTCDate() + CONTRACT_END_LEAD_DAYS)
  const inAWeekIso = inAWeek.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('contracts')
    .select('id, title, start_date, end_date, status, client_id, clients(company_name, full_name)')
    .or(
      // start_date == today OR end_date in [today, today+lead]
      `start_date.eq.${today},and(end_date.gte.${today},end_date.lte.${inAWeekIso})`,
    )
    .neq('status', 'cancelled')
  if (error) {
    if (!String(error.message).toLowerCase().includes('column')) {
      console.error('[scheduler/events] contracts query failed:', error.message)
    }
    return
  }
  for (const c of data ?? []) {
    const company = c.clients?.company_name || 'a client'
    if (c.start_date === today) {
      const key = `contract-start-${c.id}`
      if (!firedEventSet.has(key)) {
        const body = `📄 Contract starts today\n\n*${c.title}*\nClient: ${company}\n\nKick-off day — make sure the team's plan is ready.`
        await fireEvent(sock, fallbackJid, body, key, `contract-start ${c.id}`)
      }
    }
    if (c.end_date) {
      // End-date warning fires on each day in the lead window. We dedupe
      // by id + the day it actually fired, so the admin gets one ping per
      // day during the lead-up rather than nothing at all.
      const daysOut = Math.round(
        (new Date(c.end_date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86_400_000,
      )
      if (daysOut === 0 || daysOut === CONTRACT_END_LEAD_DAYS) {
        const key = `contract-end-${c.id}-d${daysOut}`
        if (!firedEventSet.has(key)) {
          const word = daysOut === 0 ? 'ends today' : `ends in ${CONTRACT_END_LEAD_DAYS} days`
          const body = `⏳ Contract ${word}\n\n*${c.title}*\nClient: ${company}\nEnds: ${c.end_date}\n\nTime to start the renewal conversation.`
          await fireEvent(sock, fallbackJid, body, key, `contract-end ${c.id} d=${daysOut}`)
        }
      }
    }
  }
}

// Weekly reports: when issue_date <= today AND status='draft', ping the
// assignee that the report is now due to write.
async function tickWeeklyReportDue(sock, notifyJids, today) {
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('id, report_number, customer_company, period_start, period_end, issue_date, status, assignee_id')
    .eq('status', 'draft')
    .lte('issue_date', today)
    .not('assignee_id', 'is', null)
    .limit(50)
  if (error) {
    if (!String(error.message).toLowerCase().includes('column')) {
      console.error('[scheduler/events] weekly_reports query failed:', error.message)
    }
    return
  }
  for (const r of data ?? []) {
    const key = `report-due-${r.id}`
    if (firedEventSet.has(key)) continue
    const target = await resolveAssigneeJid(r.assignee_id, notifyJids)
    const body =
      `📊 Weekly report due\n\n*${r.report_number}*\n` +
      `Client: ${r.customer_company || '—'}\n` +
      `Period: ${r.period_start} → ${r.period_end}\n` +
      `Due: ${r.issue_date}\n\n` +
      `Open the dashboard → Weekly Reports to fill it out.`
    await fireEvent(sock, target, body, key, `report-due ${r.report_number}`)
  }
}

// Content items: when publish_date == today AND schedule_status is
// 'scheduled' or 'approved' AND the post has an assignee, ping them.
async function tickContentPublishDates(sock, notifyJids, today) {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, title, platform, content_type, publish_date, publish_time, schedule_status, assignee_id, client_id, clients(company_name)')
    .eq('publish_date', today)
    .in('schedule_status', ['scheduled', 'approved'])
    .not('assignee_id', 'is', null)
    .limit(50)
  if (error) {
    if (!String(error.message).toLowerCase().includes('column')) {
      console.error('[scheduler/events] content_items query failed:', error.message)
    }
    return
  }
  for (const c of data ?? []) {
    const key = `content-publish-${c.id}`
    if (firedEventSet.has(key)) continue
    const target = await resolveAssigneeJid(c.assignee_id, notifyJids)
    const company = c.clients?.company_name || '—'
    const when = c.publish_time ? ` at ${String(c.publish_time).slice(0, 5)}` : ''
    const body =
      `📸 Content publishes today${when}\n\n*${c.title}*\n` +
      `Client: ${company}\n` +
      `${c.platform} · ${c.content_type}\n\n` +
      `Make sure it's queued in the scheduler / posted on time.`
    await fireEvent(sock, target, body, key, `content-publish ${c.id}`)
  }
}

// =============================================================================
// Overdue invoice nag-bot. Walks accounting_invoices where status='approved'
// or 'pushed' AND payment_date is null AND issue_date is past the stage
// threshold. Drafts a follow-up message and DMs it to admin for approval
// before sending — never auto-sends to clients without admin signoff.
//
// Stages:
//   gentle_7d     — 7 days after issue, friendly nudge
//   firm_14d      — 14 days, firmer wording
//   escalation_30d — 30 days, offer payment plan / formal escalation
//
// Dedupe via invoice_nag_log (one row per invoice+stage, UNIQUE).
// =============================================================================
async function tickOverdueInvoices(sock, notifyJids, today) {
  const fallbackJid = notifyJids[0]
  if (!fallbackJid) return

  const NOW_MS = Date.parse(today + 'T00:00:00Z')
  const stages = [
    { key: 'gentle_7d',      days: 7,  tone: 'gentle' },
    { key: 'firm_14d',       days: 14, tone: 'firm' },
    { key: 'escalation_30d', days: 30, tone: 'escalation' },
  ]

  for (const stage of stages) {
    const cutoff = new Date(NOW_MS - stage.days * 86_400_000).toISOString().slice(0, 10)

    const { data: candidates, error } = await supabase
      .from('accounting_invoices')
      .select('id, invoice_number, customer_name, client_id, total, currency, issue_date, payment_date, status')
      .in('status', ['approved', 'pushed'])
      .is('payment_date', null)
      .lte('issue_date', cutoff)
      .neq('status', 'void')
      .limit(20)
    if (error) {
      if (!String(error.message).toLowerCase().includes('column')) {
        console.error('[scheduler/overdue] query failed:', error.message)
      }
      continue
    }
    if (!candidates?.length) continue

    for (const inv of candidates) {
      // Skip if we already nagged at this stage
      const { data: existing } = await supabase
        .from('invoice_nag_log')
        .select('id, status')
        .eq('invoice_id', inv.id)
        .eq('stage', stage.key)
        .maybeSingle()
      if (existing) continue

      // Resolve client contact for the message body context
      let clientName = inv.customer_name
      let clientEmail = null
      let clientWA = null
      if (inv.client_id) {
        const { data: c } = await supabase
          .from('clients').select('company_name, full_name, email, whatsapp, phone').eq('id', inv.client_id).maybeSingle()
        if (c) {
          clientName = c.company_name || c.full_name || clientName
          clientEmail = c.email
          clientWA = c.whatsapp || c.phone
        }
      }

      // Draft the body. Keep deterministic templates so we don't burn an
      // OpenAI call per overdue invoice every 30s. Admin can rewrite in
      // the dashboard if they want something fancier.
      const amount = `${Number(inv.total ?? 0).toLocaleString('en-US')} ${inv.currency || 'SAR'}`
      const tmpl = {
        gentle: `Hi ${clientName || 'there'},\nQuick reminder — invoice ${inv.invoice_number} for ${amount} from ${inv.issue_date} is now 7 days past due. Could you confirm when payment is on its way?\nLet me know if anything's blocking it.\nThanks,\nEmergize`,
        firm: `Hi ${clientName || 'there'},\nFollowing up again on invoice ${inv.invoice_number} (${amount}, issued ${inv.issue_date}) — it's now two weeks past due.\nIf the bank transfer's been sent please share the receipt; otherwise let's get this settled this week.\nThanks,\nEmergize`,
        escalation: `Hi ${clientName || 'there'},\nInvoice ${inv.invoice_number} (${amount}) has been outstanding for over 30 days. We need to settle this — happy to discuss a short payment plan if cash flow's tight, otherwise please process the transfer today and send the receipt.\nThanks,\nEmergize`,
      }[stage.tone]

      // Insert a pending nag-log row and admin-broadcast notification.
      // Admin will see the draft in /accounting/nags and choose channel
      // (whatsapp/email/skip).
      try {
        await supabase.from('invoice_nag_log').insert({
          invoice_id: inv.id,
          stage: stage.key,
          status: 'pending',
          draft_text: tmpl,
        })
      } catch (e) {
        // UNIQUE conflict — race with another tick. Safe to skip.
        continue
      }

      const channelHint = clientWA ? 'WhatsApp' : clientEmail ? 'email' : 'manual'
      const summary =
        `💰 Overdue: ${inv.invoice_number}\n\n` +
        `${clientName || '—'} — ${amount}\n` +
        `Issued ${inv.issue_date} (${stage.days}d overdue)\n` +
        `Stage: ${stage.key}\n\n` +
        `Draft (review + reply 'send' to fire via ${channelHint}, 'skip' to dismiss):\n\n${tmpl}`

      try {
        await sock.sendMessage(fallbackJid, { text: summary })
        console.log(`[scheduler/overdue] nagged admin for ${inv.invoice_number} at stage ${stage.key}`)
      } catch (sendErr) {
        console.error('[scheduler/overdue] send failed:', sendErr?.message ?? sendErr)
      }
    }
  }
}

// =============================================================================
// HR DOCUMENT EXPIRY WATCHDOG (F1 + F12 combined — both sit on the same date
// columns, just different source records).
//
// Scans team_members.iqama_expiry / passport_expiry / visa_expiry AND every
// row in hr_documents.expiry_date. Fires WhatsApp DMs at 90 / 60 / 30 / 14 /
// 7 / 1 days out. Dedup'd via hr_expiry_watchlog (UNIQUE on emp+kind+stage).
// =============================================================================
const HR_EXPIRY_STAGES = [
  { key: '90d', days: 90, tone: 'soft' },
  { key: '60d', days: 60, tone: 'soft' },
  { key: '30d', days: 30, tone: 'standard' },
  { key: '14d', days: 14, tone: 'firm' },
  { key: '7d',  days: 7,  tone: 'urgent' },
  { key: '1d',  days: 1,  tone: 'critical' },
]

async function tickHrExpiries(sock, notifyJids, today) {
  const fallbackJid = notifyJids[0]
  if (!fallbackJid) return

  const NOW_MS = Date.parse(today + 'T00:00:00Z')

  // Build candidate set: native team_members columns + the hr_documents library.
  // We use a single union-style array of { employee_id, employee_name, kind,
  // expiry_date, source } so the loop below is uniform.
  const { data: emps } = await supabase
    .from('team_members')
    .select('id, full_name, iqama_expiry, passport_expiry, visa_expiry, status')
    .eq('status', 'active')
  const candidates = []
  for (const e of (emps ?? [])) {
    if (e.iqama_expiry)    candidates.push({ employee_id: e.id, employee_name: e.full_name, kind: 'iqama',    expiry_date: e.iqama_expiry,    document_id: null })
    if (e.passport_expiry) candidates.push({ employee_id: e.id, employee_name: e.full_name, kind: 'passport', expiry_date: e.passport_expiry, document_id: null })
    if (e.visa_expiry)     candidates.push({ employee_id: e.id, employee_name: e.full_name, kind: 'visa',     expiry_date: e.visa_expiry,     document_id: null })
  }

  // Plus every hr_documents row with expiry_date set
  const { data: docs } = await supabase
    .from('hr_documents')
    .select('id, employee_id, doc_type, doc_number, expiry_date, team_members:employee_id (full_name)')
    .not('expiry_date', 'is', null)
  for (const d of (docs ?? [])) {
    candidates.push({
      employee_id: d.employee_id,
      employee_name: d.team_members?.full_name ?? '(unknown)',
      kind: `document:${d.doc_type}`,
      expiry_date: d.expiry_date,
      document_id: d.id,
      doc_number: d.doc_number,
    })
  }

  for (const c of candidates) {
    const expMs = Date.parse(c.expiry_date + 'T00:00:00Z')
    if (Number.isNaN(expMs)) continue
    const daysUntil = Math.floor((expMs - NOW_MS) / 86_400_000)

    // Pick the SMALLEST stage threshold that's still ≥ daysUntil.
    // e.g. at 29 days we want '30d', at 13 days '14d', etc. Array is
    // descending by .days, so reverse + first-match.
    if (daysUntil < 0 || daysUntil > 90) continue
    const stage = [...HR_EXPIRY_STAGES].reverse().find((s) => daysUntil <= s.days)
    if (!stage) continue

    // Dedupe — UNIQUE (employee_id, kind, stage, expiry_date)
    const { data: existing } = await supabase
      .from('hr_expiry_watchlog')
      .select('id')
      .eq('employee_id', c.employee_id)
      .eq('kind', c.kind)
      .eq('stage', stage.key)
      .eq('expiry_date', c.expiry_date)
      .maybeSingle()
    if (existing) continue

    // Human-friendly kind label
    const kindLabel = c.kind.startsWith('document:')
      ? c.kind.slice('document:'.length).replace(/_/g, ' ')
      : c.kind

    const toneEmoji = { soft: 'ℹ️', standard: '⚠️', firm: '⚠️', urgent: '🚨', critical: '🚨🚨' }[stage.tone] || '⚠️'
    const summary =
      `${toneEmoji} ${kindLabel.toUpperCase()} expiring in ${daysUntil}d\n\n` +
      `Employee: ${c.employee_name}\n` +
      `Expiry: ${c.expiry_date}` +
      (c.doc_number ? ` (#${c.doc_number})` : '') + '\n' +
      `Stage: ${stage.key}\n\n` +
      `Open /hr/expiries to start the renewal. Reply 'snooze' to silence this until tomorrow.`

    try {
      await sock.sendMessage(fallbackJid, { text: summary })
      await supabase.from('hr_expiry_watchlog').insert({
        employee_id: c.employee_id,
        document_id: c.document_id,
        kind: c.kind,
        stage: stage.key,
        expiry_date: c.expiry_date,
        channel: 'whatsapp',
        status: 'sent',
      })
      console.log(`[scheduler/hr-expiry] nagged admin: ${c.employee_name} ${c.kind} → ${stage.key}`)
    } catch (sendErr) {
      console.error('[scheduler/hr-expiry] send failed:', sendErr?.message ?? sendErr)
    }
  }
}

// =============================================================================
// BIRTHDAY + WORK-ANNIVERSARY NUDGE (F13)
// Fires once on the day-of, deduped via anniversary_nudge_log (UNIQUE on
// employee_id + kind + year).
// =============================================================================
async function tickAnniversaries(sock, notifyJids, today) {
  const fallbackJid = notifyJids[0]
  if (!fallbackJid) return

  const [yyyy, mm, dd] = today.split('-')
  const monthDay = `${mm}-${dd}`
  const yearInt = parseInt(yyyy, 10)

  const { data: emps } = await supabase
    .from('team_members')
    .select('id, full_name, birthday, hire_date, status')
    .eq('status', 'active')

  for (const e of (emps ?? [])) {
    // BIRTHDAY
    if (e.birthday && e.birthday.slice(5) === monthDay) {
      const { data: dup } = await supabase
        .from('anniversary_nudge_log')
        .select('id').eq('employee_id', e.id).eq('kind', 'birthday').eq('year_int', yearInt).maybeSingle()
      if (!dup) {
        await sock.sendMessage(fallbackJid, {
          text: `🎂 Today is ${e.full_name}'s birthday!\n\nSend a wish? Quick template:\n\n"كل عام وأنت بخير ${e.full_name}، يومٌ سعيد ومليء بالخير 🎉 — فريق Emergize"`,
        }).catch(() => null)
        await supabase.from('anniversary_nudge_log').insert({
          employee_id: e.id, kind: 'birthday', year_int: yearInt,
        }).catch(() => null)
        console.log(`[scheduler/anniv] birthday: ${e.full_name}`)
      }
    }
    // WORK ANNIVERSARY (hire_date month+day matches today)
    if (e.hire_date && e.hire_date.slice(5) === monthDay) {
      const hireYear = parseInt(e.hire_date.slice(0, 4), 10)
      const yearsServed = yearInt - hireYear
      if (yearsServed >= 1) {
        const { data: dup } = await supabase
          .from('anniversary_nudge_log')
          .select('id').eq('employee_id', e.id).eq('kind', 'work_anniversary').eq('year_int', yearInt).maybeSingle()
        if (!dup) {
          const yLabel = yearsServed === 1 ? '1 year' : `${yearsServed} years`
          await sock.sendMessage(fallbackJid, {
            text: `🎉 ${e.full_name} just hit ${yLabel} at Emergize today!\n\nWorth a short note + maybe a small bonus. Template:\n\n"شكراً لك ${e.full_name} على ${yLabel} من العطاء — استمر في الإبداع 🚀 — فريق Emergize"`,
          }).catch(() => null)
          await supabase.from('anniversary_nudge_log').insert({
            employee_id: e.id, kind: 'work_anniversary', year_int: yearInt,
          }).catch(() => null)
          console.log(`[scheduler/anniv] work-anniversary: ${e.full_name} ${yearsServed}yr`)
        }
      }
    }
  }
}

export async function startScheduler(sock, notifyJids) {
  if (started) return
  started = true

  // Backward compat: caller used to pass a single string.
  const jids = Array.isArray(notifyJids) ? notifyJids : [notifyJids]
  if (jids.length === 0) {
    console.error('[scheduler] no notify JIDs configured — refusing to start')
    return
  }

  const tz = process.env.TIMEZONE ?? 'Asia/Riyadh'
  await loadFired()
  console.log(
    `[scheduler] started. tz=${tz} notify=[${jids.join(', ')}] already_fired=${firedSet.size}`,
  )

  const runTick = async () => {
    const today = nowInTimezone(tz).slice(0, 10)
    try {
      await tick(sock, jids, tz)
    } catch (err) {
      console.error('[scheduler] tick error:', err?.message ?? err)
    }
    try {
      await tickNotifications(sock, jids)
    } catch (err) {
      console.error('[scheduler] notif tick error:', err?.message ?? err)
    }
    try {
      await tickContractDates(sock, jids, today)
    } catch (err) {
      console.error('[scheduler] contract-dates tick error:', err?.message ?? err)
    }
    try {
      await tickWeeklyReportDue(sock, jids, today)
    } catch (err) {
      console.error('[scheduler] weekly-report tick error:', err?.message ?? err)
    }
    try {
      await tickContentPublishDates(sock, jids, today)
    } catch (err) {
      console.error('[scheduler] content-publish tick error:', err?.message ?? err)
    }
    try {
      await tickOverdueInvoices(sock, jids, today)
    } catch (err) {
      console.error('[scheduler] overdue-invoices tick error:', err?.message ?? err)
    }
    try {
      await tickHrExpiries(sock, jids, today)
    } catch (err) {
      console.error('[scheduler] hr-expiries tick error:', err?.message ?? err)
    }
    try {
      await tickAnniversaries(sock, jids, today)
    } catch (err) {
      console.error('[scheduler] anniversaries tick error:', err?.message ?? err)
    }
  }

  await runTick()
  setInterval(runTick, POLL_INTERVAL_MS)
}
