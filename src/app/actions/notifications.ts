'use server'

import { supabaseClient } from '@/lib/supabase/client'
import { revalidatePath } from 'next/cache'

export async function markNotificationRead(id: string) {
  await (supabaseClient as any)
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
  revalidatePath('/', 'layout')
}

export async function markAllNotificationsRead() {
  const { data } = await (supabaseClient as any)
    .from('notifications')
    .select('id')
    .eq('is_read', false)
  
  if (data && data.length > 0) {
    for (const n of data) {
      await (supabaseClient as any)
        .from('notifications')
        .update({ is_read: true })
        .eq('id', n.id)
    }
  }
  revalidatePath('/', 'layout')
}

export async function createNotification({
  title,
  message,
  type,
  related_id,
  user_id,
}: {
  title: string
  message: string
  type: string
  related_id?: string
  user_id?: string
}) {
  await (supabaseClient as any).from('notifications').insert({
    title,
    message,
    type,
    related_id: related_id || null,
    user_id: user_id || null,
    is_read: false,
  })
}
