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
import { extractText as pdfExtractText, getDocumentProxy } from 'unpdf'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
const ALLOWED_PHONES = new Set()             // phone-only subset, used for auto-LID-learning
const NOTIFY_JIDS = []                       // ordered, one per user
const SENDER_TO_NOTIFY_JID = new Map()       // any incoming-id → that user's notify JID
const PHONE_TO_NOTIFY_JID = new Map()        // phone → the original notify JID, used when we
                                             // auto-learn a LID and want to keep routing
                                             // replies to the same place as the configured user
for (const u of USERS) {
  ALLOWED_SET.add(u.phone)
  ALLOWED_PHONES.add(u.phone)
  if (u.lid) ALLOWED_SET.add(u.lid)
  const jid = u.lid ? `${u.lid}@lid` : `${u.phone}@s.whatsapp.net`
  NOTIFY_JIDS.push(jid)
  SENDER_TO_NOTIFY_JID.set(u.phone, jid)
  if (u.lid) SENDER_TO_NOTIFY_JID.set(u.lid, jid)
  PHONE_TO_NOTIFY_JID.set(u.phone, jid)
}

// In-memory LID auto-learn cache. When a message arrives from an unknown
// `@lid` sender but baileys includes the actual phone number elsewhere in
// the message (msg.key.senderPn in modern baileys), we resolve the phone
// and — if it's in ALLOWED_PHONES — accept the message AND remember the
// LID-to-phone mapping for the rest of the process lifetime. Avoids the
// "paste LID into env and restart" dance every time a new user messages
// the bot without saving its number as a contact.
const LEARNED_LIDS = new Set()

if (ALLOWED_SET.size === 0) throw new Error('Missing ALLOWED_PHONE (or ALLOWED_LID) in env')
if (!process.env.OPENAI_CHATGPT_TOKEN) throw new Error('Missing OPENAI_CHATGPT_TOKEN in env')

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

// Best-effort: pull the sender's actual phone number out of a baileys
// message. Different baileys versions stash it in different places; we
// check the common ones in priority order and return the first hit as a
// digits-only string. Returns null if no phone can be resolved (e.g. the
// sender is purely LID-only with no backing phone exposed).
function extractSenderPhone(msg) {
  const candidates = [
    msg?.key?.senderPn,            // newer baileys, 1-on-1 from non-contact
    msg?.key?.participantPn,       // group equivalent of senderPn
    msg?.senderPn,                 // some forks
    msg?.participantPn,            // older fork field
    msg?.verifiedBizName,          // not phone but worth a glance — fallthrough
  ]
  for (const c of candidates) {
    if (typeof c !== 'string') continue
    // Common forms: "966577602467", "966577602467@s.whatsapp.net", "+966 57 760 2467"
    const digits = c.replace(/[^0-9]/g, '')
    if (digits.length >= 8 && digits.length <= 16) return digits
  }
  return null
}

function extractText(msg) {
  const m = msg.message ?? {}
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.documentWithCaptionMessage?.message?.documentMessage?.caption ??
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

// Inbound document (PDF / Word / etc) handler — mirrors downloadImage
// but for documentMessage. Cap at 32MB so a malicious / oversized PDF
// can't hang the worker.
const MAX_DOC_BYTES = 32 * 1024 * 1024
async function downloadDocument(documentMessage) {
  const stream = await downloadContentFromMessage(documentMessage, 'document')
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const buffer = Buffer.concat(chunks)
  if (buffer.length > MAX_DOC_BYTES) {
    throw new Error('document too large (>32 MB)')
  }
  return {
    buffer,
    mime: documentMessage.mimetype || 'application/octet-stream',
    fileName: documentMessage.fileName || 'document',
    fileLength: documentMessage.fileLength?.low ?? buffer.length,
  }
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

// Same idea for documents — re-host into the agency-files bucket so the
// agent can later attach it to a client (add_client_file_link) or read
// it back from a tool. Returns { url, fileName, mime, size, extractedText? }.
// PDF text is extracted via unpdf so the LLM can read the contents
// inline without needing a separate read_pdf call.
const _sbForDocs = createSupabaseClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

async function rehostInboundDocument({ buffer, mime, fileName }) {
  try {
    // 1. Re-host bytes
    const ext = (fileName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin'
    const safeStem = (fileName.replace(/\.[^.]+$/, '') || 'doc')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'doc'
    const path = `wa-inbound/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safeStem}.${ext}`
    const { error: upErr } = await _sbForDocs.storage
      .from('agency-files')
      .upload(path, buffer, { contentType: mime, upsert: false })
    if (upErr) {
      console.error('inbound doc upload failed:', upErr.message)
      return null
    }
    const { data: pub } = _sbForDocs.storage.from('agency-files').getPublicUrl(path)

    // 2. Extract PDF text if applicable. Capped at 8k chars to keep the
    //    chat-completions prompt under control; the agent can call
    //    read_pdf for the full thing if it needs more.
    let extracted = null
    if (mime === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      try {
        const pdf = await getDocumentProxy(new Uint8Array(buffer))
        const { text } = await pdfExtractText(pdf, { mergePages: true })
        extracted = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 8000)
      } catch (e) {
        console.warn('PDF text extraction failed:', e?.message ?? e)
      }
    }

    return {
      url: pub?.publicUrl ?? null,
      fileName,
      mime,
      size: buffer.length,
      extractedText: extracted,
    }
  } catch (err) {
    console.error('inbound doc rehost failed:', err?.message ?? err)
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
    browser: ['Emergize Agent', 'Chrome', '1.0.0'],
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

  // Dedupe by msg.key.id. Baileys fires `messages.upsert` for the SAME
  // message twice when the socket churns (disconnect → 'notify' missed →
  // reconnect → same message re-delivered as 'append'). Without this
  // every reply went out twice. In-memory only; LRU-evicted at 1000
  // entries so it never grows unbounded. Resets on process restart,
  // which is fine — baileys doesn't replay old messages from disk on
  // a fresh boot, only on intra-session reconnects.
  const handledIds = new Set()
  const MAX_HANDLED_IDS = 1000

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // notify = brand-new message received now
    // append = catch-up after reconnect (missed while offline) — we want these too
    if (type !== 'notify' && type !== 'append') return

    for (const msg of messages) {
      const msgId = msg.key?.id
      if (msgId) {
        if (handledIds.has(msgId)) continue // already replied to in this process
        handledIds.add(msgId)
        if (handledIds.size > MAX_HANDLED_IDS) {
          // Drop oldest (Set preserves insertion order)
          const oldest = handledIds.values().next().value
          handledIds.delete(oldest)
        }
      }
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
    // Before rejecting, try to learn this LID. Modern baileys exposes the
    // sender's phone number alongside the LID for non-contact senders, in
    // various message-shape locations depending on version. If the phone
    // resolves to one of our configured ALLOWED_PHONES, we accept the
    // message and cache the LID for the rest of this process lifetime.
    // Future restarts re-learn — fine because the LID is stable per device.
    const phoneCandidate = extractSenderPhone(msg)
    if (phoneCandidate && ALLOWED_PHONES.has(phoneCandidate)) {
      ALLOWED_SET.add(sender)
      LEARNED_LIDS.add(sender)
      // Route any future incoming-id reference for this LID back to the
      // user's original configured notify JID, so reminders/scheduling
      // keep working consistently.
      const notifyJid = PHONE_TO_NOTIFY_JID.get(phoneCandidate)
      if (notifyJid) SENDER_TO_NOTIFY_JID.set(sender, notifyJid)
      console.log(`[learn] LID ${sender} -> phone ${phoneCandidate} (auto-learned, allowing)`)
    } else {
      // Log once per unknown sender so we can capture LIDs of newly-added users
      // before they exist in the env. Prefix lets you grep for it. We don't
      // reply — silent rejection is the right policy for unauthorized senders.
      console.log(`[reject] sender=${sender} jid=${jid} (not in ALLOWED_SET, phoneCandidate=${phoneCandidate ?? 'unknown'})`)
      return
    }
  }

  // Reply target — the JID to send the agent's response back on. This is
  // also the JID we tag onto reminders the user creates this turn.
  const replyJid = SENDER_TO_NOTIFY_JID.get(sender) ?? jid

  const text = extractText(msg)
  const images = []
  const imageUrls = []
  const documents = []
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

  // Inbound documents (PDF / Word / CSV / etc). Baileys nests
  // documents-with-captions one level deeper, hence the fallback.
  const documentMessage =
    msg.message?.documentMessage ??
    msg.message?.documentWithCaptionMessage?.message?.documentMessage ??
    null
  if (documentMessage) {
    try {
      const downloaded = await downloadDocument(documentMessage)
      const rehosted = await rehostInboundDocument(downloaded)
      if (rehosted) documents.push(rehosted)
    } catch (err) {
      await sock.sendMessage(jid, { text: `Could not read document: ${err?.message ?? 'unknown'}` })
      return
    }
  }

  if (!text && images.length === 0 && documents.length === 0) return

  console.log(`[in ${sender}] ${text || '(media only)'}${images.length ? ` [+${images.length} image]` : ''}${imageUrls.length ? ` [→ rehosted]` : ''}${documents.length ? ` [+${documents.length} document(s)]` : ''}`)

  try { await sock.sendPresenceUpdate('composing', jid) } catch {}
  // Run the entire handler inside an async-local request scope so deep
  // executors (add_reminder, send_quotation_pdf, etc.) can resolve the
  // current sender's JID without their signatures growing a sender param.
  const reply = await withRequest({ senderJid: replyJid, sender }, () =>
    handleMessage(text, { images, imageUrls, documents, sender }),
  )
  await sock.sendMessage(jid, { text: reply })
  try { await sock.sendPresenceUpdate('paused', jid) } catch {}

  console.log(`[out ${sender}] ${reply}`)
}

start().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
