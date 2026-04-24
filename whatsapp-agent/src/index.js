import 'dotenv/config'
import pkg from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { handleMessage } from './agent.js'

const { Client, LocalAuth } = pkg

const ALLOWED = process.env.ALLOWED_PHONE
if (!ALLOWED) throw new Error('Missing ALLOWED_PHONE in env')
if (!process.env.OPENAI_CHATGPT_TOKEN) throw new Error('Missing OPENAI_CHATGPT_TOKEN in env')

const wa = new Client({
  authStrategy: new LocalAuth({ clientId: 'adaa-agent' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
})

wa.on('qr', (qr) => {
  console.log('\nScan this QR with WhatsApp (Settings -> Linked devices -> Link a device):')
  qrcode.generate(qr, { small: true })
})

wa.on('authenticated', () => console.log('WhatsApp authenticated.'))
wa.on('ready', () => console.log(`Agent ready. Listening for messages from ${ALLOWED}.`))
wa.on('auth_failure', (m) => console.error('Auth failure:', m))
wa.on('disconnected', (r) => console.error('Disconnected:', r))

// Max image size to accept. WhatsApp photos are usually well under this,
// but someone could send a huge attachment — cap it to avoid OOM on the VPS.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB

wa.on('message', async (msg) => {
  // Only accept messages from the allowed phone. Ignore everything else.
  // msg.from is like "971501234567@c.us" for personal chats.
  const sender = msg.from.split('@')[0]
  if (sender !== ALLOWED) return
  if (msg.fromMe) return

  const text = (msg.body ?? '').trim()
  const images = []

  if (msg.hasMedia) {
    try {
      const media = await msg.downloadMedia()
      if (!media) {
        await msg.reply('Could not download the attachment.')
        return
      }
      if (!media.mimetype?.startsWith('image/')) {
        await msg.reply(`I can only read text and images. (got ${media.mimetype})`)
        return
      }
      // media.data is base64 already. Rough byte size = base64 length * 3/4.
      const approxBytes = (media.data?.length ?? 0) * 0.75
      if (approxBytes > MAX_IMAGE_BYTES) {
        await msg.reply('Image too large. Please send a smaller version (<8 MB).')
        return
      }
      images.push(`data:${media.mimetype};base64,${media.data}`)
    } catch (err) {
      console.error('Media download failed:', err)
      await msg.reply(`Could not read the attachment: ${err?.message ?? 'unknown'}`)
      return
    }
  }

  // Ignore empty messages with no media (e.g. deleted, forwarded system stuff).
  if (!text && images.length === 0) return

  console.log(`[in] ${text || '(image)'} ${images.length ? `[+${images.length} image]` : ''}`)
  try {
    const reply = await handleMessage(text, { images })
    await msg.reply(reply)
    console.log(`[out] ${reply}`)
  } catch (err) {
    console.error('Handler error:', err)
    await msg.reply(`Error: ${err?.message ?? 'unknown'}`)
  }
})

wa.initialize()
