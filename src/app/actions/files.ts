'use server'

import { agentSupabase } from '@/lib/chat-agent/supabase'
import { getCurrentUser } from '@/lib/supabase/server'
import { supabaseClient } from '@/lib/supabase/client'
import { revalidatePath } from 'next/cache'

const BUCKET = 'agency-files'

function sanitizeFilename(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'file'
  const ext = (dot > 0 ? name.slice(dot + 1) : '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase() || 'bin'
  return `${base}.${ext}`
}

function readFile(formData: FormData, name: string): File | null {
  const v = formData.get(name)
  if (!v || typeof v === 'string') return null
  return v as File
}

// User-facing upload action. Receives the file + metadata as FormData,
// pushes the bytes to the `agency-files` bucket via the service-role
// client (bypassing RLS), then inserts a row in `client_files` so the
// Files page can render it.
export async function uploadClientFile(formData: FormData): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    if (!me) return { ok: false, error: 'Not signed in.' }

    const client_id = (formData.get('client_id') as string | null)?.trim() || ''
    const category = (formData.get('category') as string | null)?.trim() || 'Other'
    let displayName = (formData.get('name') as string | null)?.trim() || ''

    if (!client_id) return { ok: false, error: 'Pick a client.' }

    const file = readFile(formData, 'file')
    if (!file || !file.size) return { ok: false, error: 'Attach a file before submitting.' }
    if (file.size > 100 * 1024 * 1024) return { ok: false, error: 'File is too large (100MB limit).' }

    if (!displayName) displayName = file.name

    const safe = sanitizeFilename(file.name)
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
    const path = `${client_id}/${Date.now()}-${safe}`

    const sb = agentSupabase()
    const buf = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` }

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
    const storage_path = pub?.publicUrl ?? path

    const { data: row, error: insErr } = await sb
      .from('client_files')
      .insert({
        name: displayName,
        category,
        client_id,
        file_type: ext,
        size: file.size,
        storage_path,
        uploaded_by: me.id,
      })
      .select('id')
      .single()
    if (insErr || !row) {
      // Clean up the orphan storage object so we don't accumulate garbage.
      await sb.storage.from(BUCKET).remove([path]).catch(() => null)
      return { ok: false, error: `Save failed: ${insErr?.message ?? 'unknown'}` }
    }

    revalidatePath('/files')
    return { ok: true, id: (row as any).id }
  } catch (err: any) {
    console.error('uploadClientFile crashed:', err)
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function deleteFileRecord(id: string) {
  // Best-effort: also remove the underlying storage object so we don't
  // leak files. We resolve the path from storage_path. Public URLs look
  // like https://<project>.supabase.co/storage/v1/object/public/agency-files/<path>
  try {
    const { data: row } = await (supabaseClient as any)
      .from('client_files')
      .select('storage_path')
      .eq('id', id)
      .maybeSingle()
    const url: string | undefined = row?.storage_path
    if (url) {
      const marker = `/object/public/${BUCKET}/`
      const ix = url.indexOf(marker)
      if (ix >= 0) {
        const path = url.slice(ix + marker.length)
        await agentSupabase().storage.from(BUCKET).remove([path]).catch(() => null)
      }
    }
  } catch { /* ignore — DB delete is the source of truth */ }

  await (supabaseClient as any).from('client_files').delete().eq('id', id)
  revalidatePath('/files')
}

// LEGACY: kept around in case anything outside the Files page calls it.
// New code should use uploadClientFile() above.
export async function createFileRecord(formData: FormData) {
  const name = formData.get('name') as string
  const category = formData.get('category') as string
  const client_id = formData.get('client_id') as string
  const file_type = name.split('.').pop() || 'file'

  await (supabaseClient as any).from('client_files').insert({
    name, category, client_id,
    file_type,
    size: 0,
    storage_path: `/files/${client_id}/${name}`,
    uploaded_by: 'tm1',
  })

  revalidatePath('/files')
}
