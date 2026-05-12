'use server'

import { agentSupabase } from '@/lib/chat-agent/supabase'
import { getCurrentUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// =============================================================================
// Content submission & admin review workflow.
//
// Lifecycle:
//   draft → submit  → schedule_status = 'pending'   (notifies admins)
//   admin → approve → schedule_status = 'approved'  (notifies submitter)
//   admin → reject  → schedule_status = 'idea'      (sends back, notifies submitter)
//
// Storage: media files live in the public 'content-uploads' bucket. The
// returned public URL is stored on content_items.media_url so the kanban
// can render thumbnails directly.
// =============================================================================

const BUCKET = 'content-uploads'

// Server actions only see strings if `formData.get` returns a non-File,
// otherwise it's a File/Blob. This narrows + asserts.
function readFile(formData: FormData, name: string): File | null {
  const v = formData.get(name)
  if (!v) return null
  if (typeof v === 'string') return null
  return v as File
}

function sanitizeFilename(name: string): string {
  // Keep only ascii-safe chars, plus collapse repeats. Storage path
  // gets nervy with unicode/spaces, especially under nginx.
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'file'
  const ext = (dot > 0 ? name.slice(dot + 1) : '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase() || 'bin'
  return `${base}.${ext}`
}

// User-facing: upload a media file + caption for a specific client, then
// flag the row for admin review.
export async function submitContentForReview(formData: FormData): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    if (!me) return { ok: false, error: 'You must be signed in to submit content.' }

    const client_id = (formData.get('client_id') as string | null)?.trim() || null
    const platform = (formData.get('platform') as string | null)?.trim() || 'instagram'
    const content_type = (formData.get('content_type') as string | null)?.trim() || 'post'
    const title = (formData.get('title') as string | null)?.trim() || ''
    const description = (formData.get('description') as string | null)?.trim() || ''
    const caption = (formData.get('caption') as string | null)?.trim() || ''
    const publish_date = (formData.get('publish_date') as string | null)?.trim() || new Date().toISOString().slice(0, 10)

    if (!client_id) return { ok: false, error: 'Pick a client before submitting.' }
    if (!title) return { ok: false, error: 'Add a short title for the post.' }

    const file = readFile(formData, 'media')
    if (!file || !file.size) {
      return { ok: false, error: 'Attach an image or video to submit.' }
    }
    if (file.size > 50 * 1024 * 1024) {
      return { ok: false, error: 'File is too large (50MB limit).' }
    }

    const sb = agentSupabase()

    // Store at <client_id>/<timestamp>-<safe-name> so the same name from
    // two users doesn't collide.
    const filename = sanitizeFilename(file.name || 'upload')
    const path = `${client_id}/${Date.now()}-${filename}`

    const arrayBuf = await file.arrayBuffer()
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, Buffer.from(arrayBuf), {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` }

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
    const media_url = pub?.publicUrl ?? null

    // The kanban looks at schedule_status 'pending' for the awaiting-review
    // column. Existing submitter is captured both via submitted_by (auth
    // user) and assignee_id (team_member) when we can resolve one.
    let assignee_id: string | null = null
    try {
      const { data: tm } = await sb
        .from('team_members')
        .select('id')
        .eq('user_id', me.id)
        .maybeSingle()
      assignee_id = (tm as any)?.id ?? null
    } catch { /* ignore — assignee_id is optional */ }

    const insertRow = {
      client_id,
      platform,
      content_type,
      title,
      caption: caption || null,
      description: description || null,
      media_url,
      publish_date,
      schedule_status: 'pending',
      task_status: 'in_progress',
      assignee_id,
      submitted_by: me.id,
      submitted_at: new Date().toISOString(),
    }

    const { data: row, error: insErr } = await sb
      .from('content_items')
      .insert(insertRow)
      .select('id, title')
      .single()
    if (insErr || !row) {
      // Try to remove the orphaned upload so storage doesn't accumulate
      // garbage from failed DB inserts.
      await sb.storage.from(BUCKET).remove([path]).catch(() => null)
      return { ok: false, error: `Save failed: ${insErr?.message ?? 'unknown'}` }
    }

    // Admin-broadcast notification (user_id null means all admins). The
    // notifications dropdown already shows the Approve/Reject buttons for
    // content_pending_review the same way it does for tasks.
    try {
      await sb.from('notifications').insert({
        user_id: null,
        title: 'Content Pending Review',
        message: `"${title}" was submitted by ${me.email ?? 'a team member'} for review.`,
        type: 'content_pending_review',
        related_id: (row as any).id,
        is_read: false,
      })
    } catch (e) {
      console.warn('content_pending_review notification insert failed', e)
    }

    revalidatePath('/content')
    revalidatePath('/notifications')
    revalidatePath('/', 'layout')

    return { ok: true, id: (row as any).id }
  } catch (err: any) {
    console.error('submitContentForReview crashed:', err)
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// Admin-only: approve a submission. Moves to schedule_status 'approved'.
export async function approveContentSubmission(id: string): Promise<void> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') {
    throw new Error('Only admins can approve content.')
  }
  const sb = agentSupabase()
  const { data, error } = await sb
    .from('content_items')
    .update({
      schedule_status: 'approved',
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, title, submitted_by')
    .single()
  if (error || !data) throw new Error(`Approve failed: ${error?.message ?? 'not found'}`)

  // Close out the admin-broadcast notification so it leaves the bell.
  await sb
    .from('notifications')
    .update({ is_read: true })
    .eq('type', 'content_pending_review')
    .eq('related_id', id)

  // Ping the submitter.
  if ((data as any).submitted_by) {
    await sb.from('notifications').insert({
      user_id: (data as any).submitted_by,
      title: 'Content Approved',
      message: `Your post "${(data as any).title}" was approved.`,
      type: 'content_approved',
      related_id: id,
      is_read: false,
    })
  }

  revalidatePath('/content')
  revalidatePath('/notifications')
  revalidatePath('/my-dashboard')
  revalidatePath('/', 'layout')
}

// Admin-only: reject a submission. Optionally records review_notes that the
// submitter can read on the card.
export async function rejectContentSubmission(id: string, notes?: string): Promise<void> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') {
    throw new Error('Only admins can reject content.')
  }
  const sb = agentSupabase()
  const { data, error } = await sb
    .from('content_items')
    .update({
      schedule_status: 'idea',
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes?.trim() || null,
    })
    .eq('id', id)
    .select('id, title, submitted_by')
    .single()
  if (error || !data) throw new Error(`Reject failed: ${error?.message ?? 'not found'}`)

  await sb
    .from('notifications')
    .update({ is_read: true })
    .eq('type', 'content_pending_review')
    .eq('related_id', id)

  if ((data as any).submitted_by) {
    await sb.from('notifications').insert({
      user_id: (data as any).submitted_by,
      title: 'Content Sent Back',
      message: `Your post "${(data as any).title}" needs changes${notes?.trim() ? `: ${notes.trim()}` : '.'}`,
      type: 'content_rejected',
      related_id: id,
      is_read: false,
    })
  }

  revalidatePath('/content')
  revalidatePath('/notifications')
  revalidatePath('/my-dashboard')
  revalidatePath('/', 'layout')
}
