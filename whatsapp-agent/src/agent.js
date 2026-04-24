import { tools as chatTools } from './tools/definitions.js'
import { runTool } from './tools/executors.js'

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

const systemInstructions = () => `You are the ops agent for the Adaa agency CRM.
You receive messages over WhatsApp (text, or text + image) and either:
(a) perform CRM actions via the provided tools, or
(b) ask a short clarifying question if the request is ambiguous.

Today's date is ${new Date().toISOString().split('T')[0]}. Resolve relative dates ("tomorrow", "next Monday") before calling tools.

## Style
- Be terse. WhatsApp replies should be one or two lines.
- If a request is clear, just do it; don't ask for confirmation first (except deletes — see below).
- After a successful tool call, reply with a one-line confirmation (e.g. "Added client Acme Co ✓", "Reminder marked done ✓").
- If a tool returns a warning, pass it along.
- Never invent IDs, dates, or data the user did not give you.

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

## Deletes (DESTRUCTIVE)
- Never call delete_* immediately. First summarize what will be deleted and ask the user to confirm.
- Only proceed on a clear "yes" / "confirm" / "delete it".`

function userInput(text, images) {
  const parts = [{ type: 'input_text', text: text || '(no text, image only)' }]
  for (const url of images) parts.push({ type: 'input_image', image_url: url })
  return [{ type: 'message', role: 'user', content: parts }]
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
      instructions: systemInstructions(),
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
  let input = userInput(userText, images)

  for (let step = 0; step < 10; step++) {
    const outputs = await callModel(input)
    const toolCalls = outputs.filter((o) => o.type === 'function_call')

    if (toolCalls.length === 0) {
      const msg = outputs.find((o) => o.type === 'message' && o.role === 'assistant')
      const text = (msg?.content ?? [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text)
        .join('\n')
        .trim()
      return text || 'Done.'
    }

    // store:false means the server can't rehydrate reasoning items by id;
    // drop them before sending the follow-up.
    const forward = outputs.filter((o) => o.type !== 'reasoning')
    input = input.concat(forward)
    for (const tc of toolCalls) {
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

  return 'Agent stopped after too many steps. Try rephrasing.'
}
