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
  }

  await runTick()
  setInterval(runTick, POLL_INTERVAL_MS)
}
