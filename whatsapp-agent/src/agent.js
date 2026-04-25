import { tools as chatTools } from './tools/definitions.js'
import { runTool } from './tools/executors.js'
import { getHistory, appendUser, appendAssistant } from './memory.js'
import { listFacts } from './memory-store.js'

// The Codex backend at chatgpt.com/backend-api/codex/responses accepts ChatGPT
// Plus OAuth JWTs. Uses the OpenAI Responses API shape with SSE streaming.
const CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses'
const TOKEN = process.env.OPENAI_CHATGPT_TOKEN
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.2'
const EFFORT = process.env.REASONING_EFFORT ?? 'low'

if (!TOKEN) throw new Error('Missing OPENAI_CHATGPT_TOKEN')

// Pull the chatgpt_account_id out of the JWT. The Codex endpoint requires it.
const ACCOUNT_ID = (() => {
  try {
    const payload = JSON.parse(
      Buffer.from(TOKEN.split('.')[1], 'base64url').toString('utf8')
    )
    return payload['https://api.openai.com/auth']?.chatgpt_account_id
  } catch {
    return undefined
  }
})()
if (!ACCOUNT_ID) {
  throw new Error('Could not extract chatgpt_account_id from OPENAI_CHATGPT_TOKEN')
}

// Responses API tool schema is flatter than Chat Completions.
const tools = chatTools.map((t) => ({
  type: 'function',
  name: t.function.name,
  description: t.function.description,
  parameters: t.function.parameters,
  strict: false,
}))

// "YYYY-MM-DD HH:MM:SS" formatted in the configured timezone so the model has
// a concrete "now" to compute "in 2 minutes" / "at 3pm" against.
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
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`
}

async function systemInstructions() {
  const tz = process.env.TIMEZONE ?? 'Asia/Riyadh'
  const now = nowInTimezone(tz)
  const facts = await listFacts()
  const factsBlock =
    facts.length > 0
      ? '\n\n## Saved memories (long-term, from past conversations)\n' +
        facts.map((f) => `- [${f.id}] ${f.text}`).join('\n') +
        '\nUse these facts naturally when relevant. Call forget_fact(id) if the user asks to remove one.'
      : '\n\n## Saved memories\n(none yet)'
  return `You are the ops agent for the Adaa agency CRM.
You receive messages over WhatsApp (text, or text + image) and either:
(a) perform CRM actions via the provided tools, or
(b) ask a short clarifying question if the request is ambiguous.

Right now is ${now} in ${tz}. Use this to compute relative times/dates precisely — never ask the user what time it is. "In 2 minutes" means add 2 minutes to the clock shown above.

## Style
- Be terse. WhatsApp replies should be one or two lines.
- If a request is clear, just do it; don't ask for confirmation first (except deletes — see below).
- After a successful tool call, reply with a one-line confirmation (e.g. "Added client Acme Co ✓", "Reminder marked done ✓").
- If a tool returns a warning, pass it along.
- Never invent IDs, dates, or data the user did not give you.

## Stop calling tools when the work is done
- Once `send_quotation_pdf` or `send_weekly_report_pdf` returns `sent: true`, the job is done. STOP. Reply with text only — do NOT call find_*, create_*, or any other tool to "verify" or "follow up".
- After a successful create/update/delete, do NOT immediately call find_* on the same record to confirm — the create's response already includes what you need.
- One user request = one outcome. Don't speculatively create siblings (e.g. don't create a second quote for the same client unless the user asked).
- If your last reply was a fallback like "Hit the step ceiling…" and the user just says "continue" / "go" / "ok", DO NOT redo creates or sends. Instead, ask what specifically they want next.

## Resolving references
- When the user names an existing client/contract/campaign/etc. by name, call the matching find_* tool first to get the id.
- 0 matches → tell the user.
- >1 matches → ask which one (list them briefly).
- Then proceed with the update/link.
- For tasks that mention an assignee, set assignee_name on add_task — the backend resolves it.

## Images
- If the user sends an image, look at it and act on its contents.
- Business cards / contact info → extract name, company, phone, email, city, website, title → call add_client with status="to_contact" (unless the user explicitly says otherwise). These land in the dashboard's "Clients to Contact" section for later outreach.
- Screenshots of a contract → extract key fields (title, parties, dates, value) and call add_contract (after find_client).
- Screenshots of a social profile → call add_social_account.
- If the image is ambiguous, ask what the user wants done with it in one short line.
- **Inbound images are auto-rehosted in Supabase Storage** and the public URL appears at the end of the user message as `[uploaded_image: https://...]`. When the user wants the image used as a thumbnail, contract file, or content media, paste that URL into the relevant tool's media_url / file_path field — DON'T call upload_image again.

## Weekly reports
- "Make a weekly report for <client>" → create_weekly_report (period_start/end default to last Mon → today). Then incrementally fill it: add_report_kpi (up to 4), add_report_platform per channel, add_report_content per post, add_report_campaign per campaign, add_report_task with kind="done" or "plan".
- After populating, call send_weekly_report_pdf(id) to deliver the PDF over WhatsApp.
- "Add the following to the latest report …" → find_weekly_report most recent for that client, then append.
- For images in content rows: if the user sent an image referenced as `[uploaded_image: …]`, pass that URL as media_url. Or call upload_image with image_url=<external URL> if they linked something.

## Reminders — IMPORTANT
- When creating a reminder, the agent will actually send the user a WhatsApp message at the due date + due_time.
- If the user specifies a time ("at 3pm", "tomorrow 9am", "Friday 18:00"), convert to 24h HH:MM and pass as due_time.
- If they don't specify a time, omit due_time — it will fire at 09:00 local by default.
- All times are in the user's local timezone (Asia/Riyadh by default).
- Example: "remind me to call Acme at 3pm tomorrow" → add_reminder({ title: "Call Acme", due_date: "<tomorrow>", due_time: "15:00", type: "call", client_company_name: "Acme" }).
- Reply with something like "Reminder set for Tue 25 Nov 15:00 ✓" so the user can confirm the time.

## Notes on clients
- To add a free-form note to a client, call add_client_note. It APPENDS with today's date and preserves all prior notes.
- Never use update_client({ notes: ... }) for appending to the log — that overwrites.

## Quotations (price estimates)
- "Quote <client> for <items>" → call create_quotation (pass client_name_en and client_company_name if the user named a CRM client), then loop add_quotation_item once per line item.
- Item pricing: if the user gives a fixed SAR amount, pricing_mode="fixed" with qty+unit_price. If they say "X% of profit", pricing_mode="percentage" with percentage=X.
- Defaults already applied server-side: VAT 15%, 50/50 terms, valid 30 days, Adaa company info — DO NOT re-specify these unless the user explicitly wants to override.
- **After create_quotation + all add_quotation_item calls, ALWAYS call send_quotation_pdf(id) last.** The user gets a PDF file attached to WhatsApp — that's the whole point. Do NOT skip this step unless the user explicitly says "no PDF" or "I'll edit first".
- Reply format after send_quotation_pdf succeeds: "Q-2026-001 ready ✓ PDF sent + https://<host>/quotations/<id>".
- "Send Q-2026-001 as PDF" / "resend the quote" → just call send_quotation_pdf(id) for the existing quote.
- "Mark Q-2026-001 as sent/accepted/paid/rejected" → set_quotation_status.
- "Show my pending quotes" / "find quote for Acme" → find_quotation.
- If the user gives client details that don't match any CRM client, save the quote anyway — it'll render with the names they provided, just unlinked.

## Deletes (DESTRUCTIVE)
- Never call delete_* immediately. First summarize what will be deleted and ask the user to confirm.
- Only proceed on a clear "yes" / "confirm" / "delete it".

## Long-term memory — BE VERY FRUGAL
Every saved fact sits in the system prompt of every future call, so it costs tokens forever. Treat memory like a small notebook, not a diary.

- Call remember_fact ONLY when BOTH are true:
  (1) the user explicitly says "remember …", "memorize …", "don't forget …", OR the info is a durable user preference (timezone, city, language, a key contact name)
  (2) the info will plausibly affect replies weeks from now
- Keep each fact **under ~15 words** — compress aggressively (bad: "The user told me today that their city is Dammam in Saudi Arabia"; good: "User's city: Dammam, Saudi Arabia").
- Never save: current task status, today's meetings, in-flight conversation, chit-chat, things already obvious from the CRM DB.
- Check the "Saved memories" list below FIRST — if a similar fact exists, update (forget old + save new) or skip.
- Store hard-limits at 25 facts. If the save tool returns "memory full", don't retry — tell the user to drop some.
- Call forget_fact(id) when the user says "forget …" or "drop that".${factsBlock}`
}

function userMessageItem(text, images, imageUrls) {
  // The data URLs go to vision; the public URLs are surfaced in the text so
  // the model can paste them into tool calls (media_url, file_path, etc.).
  const baseText = text || '(no text, image only)'
  const tag = (imageUrls ?? [])
    .map((u) => `\n\n[uploaded_image: ${u}]`)
    .join('')
  const parts = [{ type: 'input_text', text: baseText + tag }]
  for (const url of images) parts.push({ type: 'input_image', image_url: url })
  return { type: 'message', role: 'user', content: parts }
}

async function parseStream(res) {
  const items = []
  let finalError = null
  let buf = ''
  const decoder = new TextDecoder()
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true })
    const events = buf.split('\n\n')
    buf = events.pop() ?? ''
    for (const block of events) {
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
      if (!dataLine) continue
      const raw = dataLine.slice(6).trim()
      if (raw === '[DONE]') continue
      let ev
      try { ev = JSON.parse(raw) } catch { continue }
      if (ev.type === 'response.output_item.done' && ev.item) {
        items.push(ev.item)
      } else if (ev.type === 'response.failed' || ev.type === 'error') {
        finalError = ev.response?.error?.message ?? ev.error?.message ?? 'unknown codex error'
      }
    }
  }
  if (finalError) throw new Error(finalError)
  return items
}

async function callModel(input) {
  const instructions = await systemInstructions()
  const res = await fetch(CODEX_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'chatgpt-account-id': ACCOUNT_ID,
      originator: 'codex_cli_rs',
      'User-Agent': 'codex_cli_rs/0.40.0',
    },
    body: JSON.stringify({
      model: MODEL,
      input,
      tools,
      store: false,
      stream: true,
      instructions,
      reasoning: { effort: EFFORT },
      parallel_tool_calls: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`codex API ${res.status}: ${body.slice(0, 400)}`)
  }
  return parseStream(res)
}

export async function handleMessage(userText, opts = {}) {
  const images = opts.images ?? []
  const imageUrls = opts.imageUrls ?? []
  const sender = opts.sender ?? 'default'

  // Start with the rolling per-sender history so follow-ups like "yes",
  // "Dammam", "at 3pm" stay anchored to the original request.
  const history = getHistory(sender)
  const userMsg = userMessageItem(userText, images, imageUrls)
  appendUser(sender, userMsg)

  let input = [...history, userMsg]

  // Track what tools actually ran this turn so the fallback message can
  // tell the user what got done — much more useful than "try rephrasing"
  // when they're staring at three quotes that already exist.
  const toolsRun = []

  // 25 is generous enough for a quote with ~15 line items + create + send_pdf,
  // or a fully-populated weekly report (KPIs + platforms + content + campaigns
  // + tasks + send_pdf), without inviting runaway loops.
  const MAX_STEPS = 25

  for (let step = 0; step < MAX_STEPS; step++) {
    const outputs = await callModel(input)
    const toolCalls = outputs.filter((o) => o.type === 'function_call')

    if (toolCalls.length === 0) {
      const msg = outputs.find((o) => o.type === 'message' && o.role === 'assistant')
      const text = (msg?.content ?? [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text)
        .join('\n')
        .trim()
      const reply = text || 'Done.'
      appendAssistant(sender, reply)
      return reply
    }

    // store:false means the server can't rehydrate reasoning items by id;
    // drop them before sending the follow-up.
    const forward = outputs.filter((o) => o.type !== 'reasoning')
    input = input.concat(forward)
    for (const tc of toolCalls) {
      toolsRun.push(tc.name)
      let output
      try {
        const args = JSON.parse(tc.arguments || '{}')
        const result = await runTool(tc.name, args)
        output = JSON.stringify(result)
      } catch (err) {
        output = JSON.stringify({ error: String(err?.message ?? err) })
      }
      input.push({ type: 'function_call_output', call_id: tc.call_id, output })
    }
  }

  // Hit the ceiling. Tell the user *what got done* so they can decide whether
  // to retry. Without this they'd just see a generic "rephrase" and reply
  // "continue" — which the model interprets as "do it again from scratch",
  // producing duplicate quotes/reports.
  const counts = toolsRun.reduce((acc, n) => ((acc[n] = (acc[n] ?? 0) + 1), acc), {})
  const summary = Object.entries(counts)
    .map(([n, c]) => `${n}×${c}`)
    .join(', ')
  const fallback =
    `Hit the ${MAX_STEPS}-step ceiling before I could finish. Already ran: ${summary}. ` +
    `Tell me what to do next — DON'T just say "continue", that would re-run from scratch.`
  appendAssistant(sender, fallback)
  return fallback
}
