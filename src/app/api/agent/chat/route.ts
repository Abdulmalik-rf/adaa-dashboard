import { NextResponse } from 'next/server'
import { handleChat, type ChatTurn } from '@/lib/chat-agent/llm'
import { ALLOWED_ORIGINS, corsHeaders } from '@/lib/cors'

// Dashboard chat endpoint. Client sends {message, history} — we stream-parse
// the codex response server-side, run any tool calls against Supabase with
// the service role, then return the final assistant reply.
//
// Stateless on the server: conversation state lives in the client
// (React + localStorage), trimmed to the last ~16 turns before being sent.
//
// CORS: also called cross-origin from the public website at
// https://emergize-sa.com. See src/lib/cors.ts for the allowlist.
//
// Mode: requests originating from the public-website allowlist are routed
// through handleChat with mode='public', which restricts the tool surface
// to a single insert-only book_meeting tool and uses a public-mode system
// prompt. Internal callers (dashboard widget, no Origin header, or any
// non-public origin) get the full internal tool set.
//
// Rate limit: per-IP fixed-window (10 req/min) using an in-memory Map.
// Resets on process restart, single-instance only — fine for the dev
// server and for Hostinger's single-node deploy. Switch to Redis/KV if
// scaled out.

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // seconds — codex SSE + tool loop can take a bit

const MAX_HISTORY_TURNS = 16
const MAX_MESSAGE_LEN = 4000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10

// Module-scoped Map survives across requests in the same Node process.
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function clientIp(req: Request): string {
  // x-forwarded-for is set by Hostinger/Vercel/most reverse proxies; first
  // entry is the original client. Falls back to '0.0.0.0' so the limiter
  // still groups anonymous local-dev hits together.
  const xff = req.headers.get('x-forwarded-for')
  if (!xff) return '0.0.0.0'
  return xff.split(',')[0]!.trim() || '0.0.0.0'
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 }
  }
  bucket.count += 1
  return { allowed: true, remaining: RATE_LIMIT_MAX - bucket.count }
}

function isPublicOrigin(origin: string | null): boolean {
  return !!origin && (ALLOWED_ORIGINS as readonly string[]).includes(origin)
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get('origin'))

  // Rate limit BEFORE parsing body or running any LLM call — cheapest
  // possible rejection for abuse.
  const ip = clientIp(req)
  const rl = checkRateLimit(ip)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limit' },
      { status: 429, headers: cors },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400, headers: cors })
  }

  const message: string = typeof body?.message === 'string' ? body.message : ''
  if (!message.trim()) {
    return NextResponse.json({ error: 'empty message' }, { status: 400, headers: cors })
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json({ error: 'message too long' }, { status: 400, headers: cors })
  }

  const rawHistory: any[] = Array.isArray(body?.history) ? body.history : []
  const history: ChatTurn[] = rawHistory
    .slice(-MAX_HISTORY_TURNS)
    .map<ChatTurn>((t) => ({
      role: t?.role === 'assistant' ? 'assistant' : 'user',
      text: String(t?.text ?? '').slice(0, MAX_MESSAGE_LEN),
    }))
    .filter((t) => t.text)

  // Public mode iff the request came from a registered public origin.
  // Internal callers (dashboard widget, server-to-server, etc.) get the
  // full tool surface.
  const mode = isPublicOrigin(req.headers.get('origin')) ? 'public' : 'internal'

  try {
    const reply = await handleChat(message, history, { mode })
    return NextResponse.json({ reply }, { headers: cors })
  } catch (err: any) {
    console.error('[chat agent]', err)
    return NextResponse.json(
      { error: err?.message ?? 'agent failed' },
      { status: 500, headers: cors },
    )
  }
}
