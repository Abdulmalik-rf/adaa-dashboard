import OpenAI from 'openai'
import { tools } from './tools/definitions.js'
import { runTool } from './tools/executors.js'

// "API key" here is a ChatGPT OAuth JWT (access_token from auth.openai.com).
// Its audience is api.openai.com/v1, so the SDK's default base URL just works.
const client = new OpenAI({ apiKey: process.env.OPENAI_CHATGPT_TOKEN })
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

const systemPrompt = () => `You are the ops agent for the Adaa agency CRM.
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

## Notes on clients
- To add a free-form note to a client ("note for Acme: met at the trade show, interested in Q2"), call add_client_note. It APPENDS with today's date and preserves all prior notes.
- Never use update_client({ notes: ... }) for adding info to the log — that overwrites everything.
- update_client is for replacing fields (status, email, phone, etc.), not for accumulating notes.

## Deletes (DESTRUCTIVE)
- Never call delete_* immediately. First summarize what will be deleted ("this will delete client Acme Co and its 3 contracts, 2 reminders, etc.") and ask the user to confirm.
- Only proceed on a clear "yes" / "confirm" / "delete it".`

/**
 * Run the agent loop.
 * @param {string} userText - Text body from WhatsApp (can be empty if image-only).
 * @param {{ images?: string[] }} opts - Optional. images is an array of data URLs like "data:image/jpeg;base64,..."
 */
export async function handleMessage(userText, opts = {}) {
  const images = opts.images ?? []

  // OpenAI chat content: plain string if text-only, array if images present.
  const userContent = images.length === 0
    ? (userText || '(no text)')
    : [
        { type: 'text', text: userText || '(no text, image only)' },
        ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
      ]

  const messages = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: userContent },
  ]

  for (let step = 0; step < 10; step++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: 'auto',
    })

    const msg = response.choices[0].message
    messages.push(msg)

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return (msg.content ?? '').trim() || 'Done.'
    }

    for (const call of msg.tool_calls) {
      let result
      try {
        const args = JSON.parse(call.function.arguments || '{}')
        result = await runTool(call.function.name, args)
      } catch (err) {
        result = { error: String(err?.message ?? err) }
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }
  }

  return 'Agent stopped after too many steps. Try rephrasing.'
}
