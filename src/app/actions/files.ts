'use server'

import { supabaseClient } from '@/lib/supabase/client'
import { revalidatePath } from 'next/cache'

export async function deleteFileRecord(id: string) {
  await (supabaseClient as any).from('client_files').delete().eq('id', id)
  revalidatePath('/files')
}

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
