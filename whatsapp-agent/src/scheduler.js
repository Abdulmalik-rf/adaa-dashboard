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

let firedSet = new Set()
let started = false

async function loadFired() {
  try {
    const data = await fs.readFile(FIRED_FILE, 'utf-8')
    const arr = JSON.parse(data)
    if (Array.isArray(arr)) firedSet = new Set(arr)
  } catch {
    // first run — file doesn't exist yet
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

async function tick(sock, notifyJid, tz) {
  const nowStr = nowInTimezone(tz)
  const today = nowStr.slice(0, 10)

  const { data, error } = await supabase
    .from('reminders')
    .select('id, title, description, due_date, due_time, priority, status')
    .eq('status', 'pending')
    .lte('due_date', today)

  if (error) {
    console.error('[scheduler] query failed:', error.message)
    return
  }
  if (!data || data.length === 0) return

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

    const body = formatReminderMessage(r, r.due_time ? timeStr.slice(0, 5) : null)
    try {
      await sock.sendMessage(notifyJid, { text: body })
      firedSet.add(r.id)
      await saveFired()
      console.log(`[scheduler] fired reminder ${r.id}: ${r.title}`)
    } catch (err) {
      console.error(`[scheduler] send failed for ${r.id}:`, err?.message ?? err)
    }
  }
}

export async function startScheduler(sock, notifyJid) {
  if (started) return
  started = true

  const tz = process.env.TIMEZONE ?? 'Asia/Riyadh'
  await loadFired()
  console.log(
    `[scheduler] started. tz=${tz} notify=${notifyJid} already_fired=${firedSet.size}`,
  )

  const runTick = async () => {
    try {
      await tick(sock, notifyJid, tz)
    } catch (err) {
      console.error('[scheduler] tick error:', err?.message ?? err)
    }
  }

  await runTick() // immediate check
  setInterval(runTick, POLL_INTERVAL_MS)
}
