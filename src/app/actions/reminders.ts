"use server"

import { supabaseClient } from "@/lib/supabase/client"
import { revalidatePath } from "next/cache"

export async function createReminder(formData: FormData) {
  const client_id = formData.get('client_id') as string
  const title = formData.get('title') as string
  const type = formData.get('type') as string
  const due_date = formData.get('due_date') as string
  const priority = formData.get('priority') as string || 'medium'
  const status = formData.get('status') as string || 'pending'

  const { error } = await (supabaseClient as any).from('reminders').insert({
    client_id,
    title,
    type,
    due_date,
    priority,
    status
  })

  if (error) throw new Error("Failed")
  revalidatePath('/reminders')
  revalidatePath('/')
  if (client_id) revalidatePath(`/clients/${client_id}`)
}

export async function updateReminderStatus(id: string, status: string, clientId?: string) {
  const { error } = await (supabaseClient as any)
    .from('reminders')
    .update({ status })
    .eq('id', id)

  if (error) throw new Error("Failed")
  revalidatePath('/reminders')
  revalidatePath('/')
  if (clientId) revalidatePath(`/clients/${clientId}`)
}

export async function deleteReminder(id: string, clientId?: string) {
  const { error } = await (supabaseClient as any)
    .from('reminders')
    .delete()
    .eq('id', id)

  if (error) throw new Error("Failed")
  revalidatePath('/reminders')
  if (clientId) revalidatePath(`/clients/${clientId}`)
}
