"use server"

import { supabaseClient } from "@/lib/supabase/client"
import { revalidatePath } from "next/cache"

export async function createCampaign(formData: FormData) {
  const client_id = formData.get('client_id') as string
  const name = formData.get('name') as string
  const objective = formData.get('objective') as string
  const budget = formData.get('budget') ? parseFloat(formData.get('budget') as string) : null
  const start_date = formData.get('start_date') as string
  const end_date = formData.get('end_date') as string
  const status = formData.get('status') as string || 'active'

  const { error } = await (supabaseClient as any).from('ad_campaigns').insert({
    client_id,
    name,
    objective,
    budget,
    start_date,
    end_date,
    status
  })

  if (error) throw new Error("Failed")
  revalidatePath('/campaigns')
  if (client_id) revalidatePath(`/clients/${client_id}`)
}

export async function deleteCampaign(id: string, clientId?: string) {
  const { error } = await (supabaseClient as any)
    .from('ad_campaigns')
    .delete()
    .eq('id', id)

  if (error) throw new Error("Failed")
  revalidatePath('/campaigns')
  if (clientId) revalidatePath(`/clients/${clientId}`)
}
