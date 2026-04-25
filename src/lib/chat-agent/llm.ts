// @ts-nocheck
// Mirrors whatsapp-agent/src/agent.js's codex+SSE tool loop, adapted for the
// dashboard chat widget: accepts a history + message, returns a reply string.
// No baileys, no puppeteer, no filesystem state — safe for Hostinger's
// shared Node runtime.

import { tools as chatTools } from './tools/definitions'
import { runTool } from './tools/executors'

const CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses'
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.2'
const EFFORT = process.env.REASONING_EFFORT ?? 'low'

function getToken(): string {
  const t = process.env.OPENAI_CHATGPT_TOKEN
  if (!t) throw new Error('chat-agent: OPENAI_CHATGPT_TOKEN is not set')
  return t
}

function getAccountId(token: string): string {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
    )
    const id = payload['https://api.openai.com/auth']?.chatgpt_account_id
    if (!id) throw new Error('missing chatgpt_account_id in JWT')
    return id
  } catch (err: any) {
    throw new Error(
      `chat-agent: cannot extract chatgpt_account_id from OPENAI_CHATGPT_TOKEN (${err?.message ?? 'parse error'})`,
    )
  }
}

const tools = (chatTools as any[]).map((t) => ({
  type: 'function' as const,
  name: t.function.name,
  description: t.function.description,
  parameters: t.function.parameters,
  strict: false,
}))

function nowInTimezone(tz: string): string {
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
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`
}

function systemInstructions(): string {
  const tz = process.env.TIMEZONE ?? 'Asia/Riyadh'
  const now = nowInTimezone(tz)
  return `You are the ops agent for the Adaa agency CRM, speaking to the user through a chat widget embedded in the dashboard at adaa-dashboard.

Right now is ${now} in ${tz}. Resolve relative dates/times ("tomorrow", "in 20 minutes") before calling tools. Never ask the user what time it is.

## Style
- Be terse. One or two sentences per reply.
- Act first, confirm second. If a request is clear, just do it — don't ask for permission (except deletes, see below).
- After a tool call, reply with a one-line confirmation like "Added client Acme Co ✓" or "Task marked done ✓". Include the quote number / client name / id snippet where useful.
- Pass tool warnings through to the user.
- Never invent IDs, dates, or data.

## Stop calling tools when the work is done
- One user request = one outcome. Don't speculatively create siblings (don't make a second quote/report for the same client unless the user asked).
- After a successful create/update/delete, do NOT immediately call find_* on the same record to "verify" — the response already includes the id and key fields.
- If your previous reply was a fallback like "Hit the step ceiling…" and the user just says "continue" / "go" / "ok", DO NOT redo any creates. Ask what specifically they want next.

## Resolving references
- When the user names an existing client/contract/campaign/etc., call the matching find_* tool first to get the id, then act.
- 0 matches → say so. >1 matches → list them briefly and ask which.

## Quotations
- "Quote X for Y" → create_quotation (pass client_name_en + client_company_name when given), then loop add_quotation_item per line item.
- Item pricing: fixed SAR → pricing_mode="fixed" with qty + unit_price. "N% of profit" → pricing_mode="percentage" with percentage=N.
- Defaults applied server-side: VAT 15%, 50/50 terms, valid 30 days, Adaa company info.
- Reply with quote number + link: "Q-2026-001 ready ✓ — open the Quotations page to view/print".
- PDF export is only available through the WhatsApp agent (puppeteer not available here). Tell the user they can generate the PDF via WhatsApp if they ask.

## Weekly reports
- "Make a weekly report for X" → create_weekly_report (period defaults to last Mon → today). Then incrementally fill: add_report_kpi (up to 4), add_report_platform per channel, add_report_content per post, add_report_campaign per campaign, add_report_task with kind="done" or "plan".
- For images on content rows: call upload_image({ image_url }) to re-host an external image and use the returned public_url as media_url. Direct file uploads aren't possible from this chat — the user has to attach via WhatsApp instead.
- Reply with report number + link: "WR-2026-W17 ready ✓ — /reports/<id>".
- PDF export of reports is also WhatsApp-only.

## Notes on clients
- "Note for X: …" → add_client_note (appends with date). Never use update_client({ notes }) for appending — that overwrites.

## Deletes (DESTRUCTIVE)
- Never call delete_* immediately. Summarize what will be removed, then ask "confirm?". Only proceed on a clear yes.`
}

function userMessageItem(text: string, images: string[]) {
  const parts: any[] = [{ type: 'input_text', text: text || '(no text)' }]
  for (const url of images) parts.push({ type: 'input_image', image_url: url })
  return { type: 'message', role: 'user', content: parts }
}

async function parseStream(res: Response): Promise<any[]> {
  const items: any[] = []
  let finalError: string | null = null
  let buf = ''
  const decoder = new TextDecoder()
  const reader = res.body?.getReader()
  if (!reader) return items

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const events = buf.split('\n\n')
    buf = events.pop() ?? ''
    for (const block of events) {
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
      if (!dataLine) continue
      const raw = dataLine.slice(6).trim()
      if (raw === '[DONE]') continue
      let ev: any
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

async function callModel(input: any[]): Promise<any[]> {
  const token = getToken()
  const accountId = getAccountId(token)

  const res = await fetch(CODEX_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'chatgpt-account-id': accountId,
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

export type ChatTurn = { role: 'user' | 'assistant'; text: string }

/**
 * Run the chat agent loop for one user message. `history` is the trimmed prior
 * conversation (client-side state), so the server stays stateless across calls.
 */
export async function handleChat(
  message: string,
  history: ChatTurn[] = [],
): Promise<string> {
  const input: any[] = []
  for (const turn of history) {
    if (turn.role === 'user') {
      input.push({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: turn.text }],
      })
    } else {
      input.push({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: turn.text }],
      })
    }
  }
  input.push(userMessageItem(message, []))

  // Tool-call audit so the fallback message can name what already ran.
  const toolsRun: string[] = []
  const MAX_STEPS = 25

  for (let step = 0; step < MAX_STEPS; step++) {
    const outputs = await callModel(input)
    const toolCalls = outputs.filter((o) => o.type === 'function_call')

    if (toolCalls.length === 0) {
      const msg = outputs.find((o) => o.type === 'message' && o.role === 'assistant')
      const text = (msg?.content ?? [])
        .filter((c: any) => c.type === 'output_text')
        .map((c: any) => c.text)
        .join('\n')
        .trim()
      return text || 'Done.'
    }

    // store:false means the server can't rehydrate reasoning items by id —
    // drop them before the follow-up.
    const forward = outputs.filter((o) => o.type !== 'reasoning')
    input.push(...forward)
    for (const tc of toolCalls) {
      toolsRun.push(tc.name)
      let output: string
      try {
        const args = JSON.parse(tc.arguments || '{}')
        const result = await runTool(tc.name, args)
        output = JSON.stringify(result)
      } catch (err: any) {
        output = JSON.stringify({ error: String(err?.message ?? err) })
      }
      input.push({ type: 'function_call_output', call_id: tc.call_id, output })
    }
  }

  const counts = toolsRun.reduce<Record<string, number>>(
    (acc, n) => ((acc[n] = (acc[n] ?? 0) + 1), acc),
    {},
  )
  const summary = Object.entries(counts).map(([n, c]) => `${n}×${c}`).join(', ')
  return (
    `Hit the ${MAX_STEPS}-step ceiling before I could finish. Already ran: ${summary}. ` +
    `Tell me what to do next — DON'T just say "continue", that would re-run from scratch.`
  )
}
