import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

// On-demand revalidation called by the WhatsApp agent after it writes to Supabase.
// Body: { paths: string[] }  — each entry is a concrete route (e.g. "/clients/abc").
// Auth: header "x-revalidate-secret" must equal REVALIDATE_SECRET.
//
// Docs: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-revalidate-secret')
  const expected = process.env.REVALIDATE_SECRET

  if (!expected) {
    return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 })
  }
  if (secret !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const raw = (body as { paths?: unknown }).paths
  const paths = Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : []

  for (const p of paths) {
    revalidatePath(p)
  }

  return NextResponse.json({ ok: true, revalidated: paths })
}
