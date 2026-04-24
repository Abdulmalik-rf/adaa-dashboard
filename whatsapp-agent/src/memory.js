// Per-sender rolling conversation window so the agent remembers what was
// said over the last few WhatsApp messages. Without this every incoming
// message is a fresh context and follow-ups like "yes" or "at 3pm" lose
// their referent.
//
// In-memory only — restart of the agent wipes context. That's fine: the
// reminder row in Supabase carries its own state; memory only exists to
// thread short back-and-forth clarifications together.

const MAX_TURNS = 16 // ~8 user + 8 assistant message items
const IDLE_RESET_MS = 30 * 60 * 1000 // 30 minutes of no activity resets context

/** @type {Map<string, { history: any[]; last: number }>} */
const state = new Map()

export function getHistory(senderId) {
  const entry = state.get(senderId)
  if (!entry) return []
  if (Date.now() - entry.last > IDLE_RESET_MS) {
    state.delete(senderId)
    return []
  }
  return entry.history
}

function add(senderId, item) {
  let entry = state.get(senderId)
  if (!entry) {
    entry = { history: [], last: Date.now() }
    state.set(senderId, entry)
  }
  entry.history.push(item)
  entry.last = Date.now()
  if (entry.history.length > MAX_TURNS) {
    entry.history = entry.history.slice(-MAX_TURNS)
  }
}

export function appendUser(senderId, userMessageItem) {
  add(senderId, userMessageItem)
}

export function appendAssistant(senderId, text) {
  if (!text) return
  add(senderId, {
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text }],
  })
}

export function clear(senderId) {
  state.delete(senderId)
}
