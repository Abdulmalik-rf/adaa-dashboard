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

let firedSet = new Set()
let firedNotifSet = new Set()
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
  }

  await runTick()
  setInterval(runTick, POLL_INTERVAL_MS)
}
