import { NextResponse } from 'next/server'
import { handleChat, type ChatTurn } from '@/lib/chat-agent/llm'

// Dashboard chat endpoint. Client sends {message, history} — we stream-parse
// the codex response server-side, run any tool calls against Supabase with
// the service role, then return the final assistant reply.
//
// Stateless on the server: conversation state lives in the client
// (React + localStorage), trimmed to the last ~16 turns before being sent.

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // seconds — codex SSE + tool loop can take a bit

const MAX_HISTORY_TURNS = 16
const MAX_MESSAGE_LEN = 4000

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
  }

  const message: string = typeof body?.message === 'string' ? body.message : ''
  if (!message.trim()) {
    return NextResponse.json({ error: 'empty message' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json({ error: 'message too long' }, { status: 400 })
  }

  const rawHistory: any[] = Array.isArray(body?.history) ? body.history : []
  const history: ChatTurn[] = rawHistory
    .slice(-MAX_HISTORY_TURNS)
    .map<ChatTurn>((t) => ({
      role: t?.role === 'assistant' ? 'assistant' : 'user',
      text: String(t?.text ?? '').slice(0, MAX_MESSAGE_LEN),
    }))
    .filter((t) => t.text)

  try {
    const reply = await handleChat(message, history)
    return NextResponse.json({ reply })
  } catch (err: any) {
    console.error('[chat agent]', err)
    return NextResponse.json(
      { error: err?.message ?? 'agent failed' },
      { status: 500 },
    )
  }
}
