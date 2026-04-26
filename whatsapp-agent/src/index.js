import 'dotenv/config'
import baileys, {
  DisconnectReason,
  useMultiFileAuthState,
  downloadContentFromMessage,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import { handleMessage } from './agent.js'
import { startScheduler } from './scheduler.js'
import { setSock } from './sock-holder.js'
import { runTool } from './tools/executors.js'
import { withRequest } from './context.js'

const makeWASocket = baileys.default ?? baileys.makeWASocket ?? baileys

// Per-user config. User 1 uses the legacy ALLOWED_PHONE / ALLOWED_LID env
// vars; additional users live under ALLOWED_PHONE_2/ALLOWED_LID_2,
// ALLOWED_PHONE_3/ALLOWED_LID_3, etc. The LID is optional — a fresh user
// whose LID we haven't seen yet works phone-only until they message in
// (their LID gets logged on the first rejected message so we can paste
// it into the .env).
function loadUsers() {
  const users = []
  if (process.env.ALLOWED_PHONE) {
    users.push({
      phone: process.env.ALLOWED_PHONE.trim(),
      lid: process.env.ALLOWED_LID?.trim() || null,
    })
  }
  for (let i = 2; ; i++) {
    const phone = process.env[`ALLOWED_PHONE_${i}`]
    if (!phone) break
    const lid = process.env[`ALLOWED_LID_${i}`]?.trim() || null
    users.push({ phone: phone.trim(), lid })
  }
  return users
}

const USERS = loadUsers()
const ALLOWED_SET = new Set()
const NOTIFY_JIDS = []                       // ordered, one per user
const SENDER_TO_NOTIFY_JID = new Map()       // any incoming-id → that user's notify JID
for (const u of USERS) {
  ALLOWED_SET.add(u.phone)
  if (u.lid) ALLOWED_SET.add(u.lid)
  const jid = u.lid ? `${u.lid}@lid` : `${u.phone}@s.whatsapp.net`
  NOTIFY_JIDS.push(jid)
  SENDER_TO_NOTIFY_JID.set(u.phone, jid)
  if (u.lid) SENDER_TO_NOTIFY_JID.set(u.lid, jid)
}

if (ALLOWED_SET.size === 0) throw new Error('Missing ALLOWED_PHONE (or ALLOWED_LID) in env')
if (!process.env.OPENAI_CHATGPT_TOKEN) throw new Error('Missing OPENAI_CHATGPT_TOKEN in env')

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function extractText(msg) {
  const m = msg.message ?? {}
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    ''
  ).trim()
}

async function downloadImage(imageMessage) {
  const stream = await downloadContentFromMessage(imageMessage, 'image')
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const buffer = Buffer.concat(chunks)
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('image too large (>8 MB)')
  }
  const mime = imageMessage.mimetype || 'image/jpeg'
  return { buffer, mime }
}

// Re-host an inbound image in Supabase Storage so the agent can paste the
// public URL into report content (media_url), client_files, etc. Returns
// null on failure — the agent still sees the image via the data URL, we
// just lose the ability to embed it in tool calls.
async function rehostInbound({ buffer, mime }, hint) {
  try {
    const result = await runTool('upload_image', {
      image_data: buffer.toString('base64'),
      mime,
      filename_hint: hint || 'wa-inbound',
    })
    return result?.public_url ?? null
  } catch (err) {
    console.error('inbound image upload failed:', err?.message ?? err)
    return null
  }
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth')
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }))

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Adaa Agent', 'Chrome', '1.0.0'],
    version,
    syncFullHistory: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      console.log('\nScan this QR with WhatsApp (Settings -> Linked devices -> Link a device):')
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'open') {
      console.log(
        `Agent ready. ${USERS.length} user${USERS.length === 1 ? '' : 's'} allowed. ` +
          `Notify JIDs: ${NOTIFY_JIDS.join(', ')}.`,
      )
      setSock(sock, NOTIFY_JIDS)
      // Scheduler reads each reminder's notify_jid; falls back to NOTIFY_JIDS[0]
      // when the column is null (legacy reminders or non-WhatsApp-created ones).
      startScheduler(sock, NOTIFY_JIDS).catch((err) =>
        console.error('scheduler failed to start:', err?.message ?? err),
      )
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut
      console.log(`Disconnected. code=${code}${loggedOut ? ' (logged out — delete ./baileys_auth to re-link)' : ''}`)
      if (!loggedOut) {
        setTimeout(() => start().catch((err) => console.error('reconnect failed:', err)), 2000)
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // notify = brand-new message received now
    // append = catch-up after reconnect (missed while offline) — we want these too
    if (type !== 'notify' && type !== 'append') return

    for (const msg of messages) {
      try {
        await handleOne(sock, msg)
      } catch (err) {
        console.error('Handler error:', err)
        try {
          await sock.sendMessage(msg.key.remoteJid, { text: `Error: ${err?.message ?? 'unknown'}` })
        } catch {}
      }
    }
  })
}

async function handleOne(sock, msg) {
  if (msg.key.fromMe) return
  const jid = msg.key.remoteJid
  if (!jid) return
  if (jid.endsWith('@g.us')) return

  const sender = jid.split('@')[0]

  if (!ALLOWED_SET.has(sender)) {
    // Log once per unknown sender so we can capture LIDs of newly-added users
    // before they exist in the env. Prefix lets you grep for it. We don't
    // reply — silent rejection is the right policy for unauthorized senders.
    console.log(`[reject] sender=${sender} jid=${jid} (not in ALLOWED_SET)`)
    return
  }

  // Reply target — the JID to send the agent's response back on. This is
  // also the JID we tag onto reminders the user creates this turn.
  const replyJid = SENDER_TO_NOTIFY_JID.get(sender) ?? jid

  const text = extractText(msg)
  const images = []
  const imageUrls = []
  if (msg.message?.imageMessage) {
    try {
      const downloaded = await downloadImage(msg.message.imageMessage)
      // Vision: data URL for the LLM to *see*.
      images.push(`data:${downloaded.mime};base64,${downloaded.buffer.toString('base64')}`)
      // Embedding: public URL for the LLM to *use* in tool calls.
      const url = await rehostInbound(downloaded, 'wa-inbound')
      if (url) imageUrls.push(url)
    } catch (err) {
      await sock.sendMessage(jid, { text: `Could not read image: ${err?.message ?? 'unknown'}` })
      return
    }
  }

  if (!text && images.length === 0) return

  console.log(`[in ${sender}] ${text || '(image only)'}${images.length ? ` [+${images.length} image]` : ''}${imageUrls.length ? ` [→ rehosted]` : ''}`)

  try { await sock.sendPresenceUpdate('composing', jid) } catch {}
  // Run the entire handler inside an async-local request scope so deep
  // executors (add_reminder, send_quotation_pdf, etc.) can resolve the
  // current sender's JID without their signatures growing a sender param.
  const reply = await withRequest({ senderJid: replyJid, sender }, () =>
    handleMessage(text, { images, imageUrls, sender }),
  )
  await sock.sendMessage(jid, { text: reply })
  try { await sock.sendPresenceUpdate('paused', jid) } catch {}

  console.log(`[out ${sender}] ${reply}`)
}

start().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
