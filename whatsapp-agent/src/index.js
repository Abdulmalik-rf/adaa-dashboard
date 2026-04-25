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

const makeWASocket = baileys.default ?? baileys.makeWASocket ?? baileys

// Accept messages from either the user's phone number (@s.whatsapp.net) or
// their LID (@lid) — LIDs are used when the two parties haven't saved each
// other as contacts.
const ALLOWED_SET = new Set(
  [process.env.ALLOWED_PHONE, process.env.ALLOWED_LID]
    .filter(Boolean)
    .map((s) => s.trim())
)
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
      console.log(`Agent ready. Listening for messages from ${[...ALLOWED_SET].join(' or ')}.`)
      // Pick the JID to send reminders / quotation PDFs TO. Prefer the LID
      // (matches how the user has been sending messages), fall back to phone.
      const notifyJid = process.env.ALLOWED_LID
        ? `${process.env.ALLOWED_LID}@lid`
        : `${process.env.ALLOWED_PHONE}@s.whatsapp.net`
      setSock(sock, notifyJid)
      startScheduler(sock, notifyJid).catch((err) =>
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

  if (!ALLOWED_SET.has(sender)) return

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

  console.log(`[in] ${text || '(image only)'}${images.length ? ` [+${images.length} image]` : ''}${imageUrls.length ? ` [→ rehosted]` : ''}`)

  try { await sock.sendPresenceUpdate('composing', jid) } catch {}
  const reply = await handleMessage(text, { images, imageUrls, sender })
  await sock.sendMessage(jid, { text: reply })
  try { await sock.sendPresenceUpdate('paused', jid) } catch {}

  console.log(`[out] ${reply}`)
}

start().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
