'use server'

import { supabaseClient } from "@/lib/supabase/client"
import { revalidatePath } from "next/cache"

export async function createContract(formData: FormData) {
  const client_id = formData.get('client_id') as string
  const title = formData.get('title') as string
  const contract_type = formData.get('contract_type') as string
  const start_date = formData.get('start_date') as string
  const end_date = formData.get('end_date') as string
  const value = formData.get('value') ? parseFloat(formData.get('value') as string) : null
  const status = formData.get('status') as string || 'active'
  const payment_cycle = formData.get('payment_cycle') as string || 'monthly'
  const notes = formData.get('notes') as string

  const { error } = await (supabaseClient as any).from('contracts').insert({
    client_id, title, contract_type, start_date, end_date, value,
    currency: 'SAR', status, payment_cycle, notes
  })

  if (error) throw new Error("Failed")

  // Check if ending soon (within 30 days)
  const endDate = new Date(end_date)
  const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / 86400000)
  if (daysLeft <= 30 && daysLeft > 0) {
    await (supabaseClient as any).from('notifications').insert({
      title: 'Contract Ending Soon',
      message: `Contract "${title}" is ending in ${daysLeft} days.`,
      type: 'contract_alert',
      is_read: false,
    })
  }

  revalidatePath('/contracts')
  revalidatePath(`/clients/${client_id}`)
}

export async function deleteContract(id: string, clientId?: string) {
  const { error } = await (supabaseClient as any).from('contracts').delete().eq('id', id)
  if (error) throw new Error("Failed")
  revalidatePath('/contracts')
  if (clientId) revalidatePath(`/clients/${clientId}`)
}
