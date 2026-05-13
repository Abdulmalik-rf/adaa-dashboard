'use server'

import { agentSupabase } from '@/lib/chat-agent/supabase'
import { getCurrentUser } from '@/lib/supabase/server'
import { supabaseClient } from '@/lib/supabase/client'
import { revalidatePath } from 'next/cache'

const BUCKET = 'agency-files'

// Lightweight metadata insert. The actual file bytes are uploaded
// directly from the browser to Supabase Storage (the bucket policies are
// public-insertable), so this action never has to receive the file body
// — sidesteps Hostinger's reverse-proxy body-size cap on shared hosting
// and the 30-60s request timeout that was making large uploads hang.
//
// IMPORTANT: the actual `client_files` table has columns named
// `file_path` and `file_size` (matching the chat-agent's writer in
// src/lib/chat-agent/tools/executors.ts). An earlier version of this
// code used `storage_path` / `size` / `uploaded_by`, which don't exist
// — every insert was failing with "Could not find the 'size' column".
export async function registerClientFile(input: {
  client_id: string
  category: string
  name: string
  file_type: string
  size: number
  storage_path: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (!me) return { ok: false, error: 'Not signed in.' }
    if (!input.client_id) return { ok: false, error: 'Pick a client.' }
    if (!input.storage_path) return { ok: false, error: 'Missing storage path.' }

    const sb = agentSupabase()
    const { data: row, error: insErr } = await sb
      .from('client_files')
      .insert({
        name: input.name || 'Untitled',
        category: input.category || 'Other',
        client_id: input.client_id,
        file_type: input.file_type || 'bin',
        file_size: input.size || 0,
        file_path: input.storage_path,
      })
      .select('id')
      .single()
    if (insErr || !row) return { ok: false, error: `Save failed: ${insErr?.message ?? 'unknown'}` }

    revalidatePath('/files')
    return { ok: true, id: (row as any).id }
  } catch (err: any) {
    console.error('registerClientFile crashed:', err)
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// Old single-call action — kept exported so any in-flight client bundles
// that still reference it don't break, but new code should use the
// browser-direct + registerClientFile() flow above.
export async function uploadClientFile(_formData: FormData) {
  return { ok: false as const, error: 'Use the browser-direct upload flow (registerClientFile).' }
}

export async function deleteFileRecord(id: string) {
  // Best-effort: also remove the underlying storage object so we don't
  // leak files. Public URLs look like
  // https://<project>.supabase.co/storage/v1/object/public/agency-files/<path>
  try {
    const { data: row } = await (supabaseClient as any)
      .from('client_files')
      .select('file_path')
      .eq('id', id)
      .maybeSingle()
    const url: string | undefined = row?.file_path
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

// LEGACY: superseded by registerClientFile(). Kept exported so any
// in-flight client bundle still pointing here keeps compiling.
export async function createFileRecord(formData: FormData) {
  const name = formData.get('name') as string
  const category = formData.get('category') as string
  const client_id = formData.get('client_id') as string
  const file_type = name.split('.').pop() || 'file'

  await (supabaseClient as any).from('client_files').insert({
    name, category, client_id,
    file_type,
    file_size: 0,
    file_path: `/files/${client_id}/${name}`,
  })

  revalidatePath('/files')
}
