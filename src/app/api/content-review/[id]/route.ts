import { NextResponse, type NextRequest } from 'next/server'
import { approveContentSubmission, rejectContentSubmission } from '@/app/actions/content-uploads'

// Stable HTTP wrapper for the content approve/reject server actions.
//
// Reason: server actions are identified by a content-derived hash that
// changes on virtually every deploy. A user with a stale browser bundle
// open will see "Server Action … was not found on the server" the next
// time they click Approve/Send Back. By routing through this fixed
// /api/content-review/<id> URL, the request path stays identical across
// builds — even if the user's bundle is hours old, the server still
// recognises the route and forwards to the current server action.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })
  }

  let body: { action?: string; notes?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    if (body.action === 'approve') {
      await approveContentSubmission(id)
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'reject') {
      await rejectContentSubmission(id, body.notes)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json(
      { ok: false, error: 'action must be "approve" or "reject"' },
      { status: 400 },
    )
  } catch (err: any) {
    // Surface admin-gating + other action errors back to the client so the
    // dialog can render them instead of silently failing.
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unexpected error' },
      { status: 500 },
    )
  }
}
