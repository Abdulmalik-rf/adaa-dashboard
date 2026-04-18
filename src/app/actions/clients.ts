"use server"

import { supabaseClient } from "@/lib/supabase/client"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function createClient(formData: FormData) {
  const company_name = formData.get('company_name') as string
  const full_name = formData.get('full_name') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const city = formData.get('city') as string
  const business_type = formData.get('business_type') as string
  const status = formData.get('status') as string

  const { data, error } = await (supabaseClient as any).from('clients').insert({
    company_name,
    full_name,
    email,
    phone,
    city,
    business_type,
    status,
    start_date: new Date().toISOString().split('T')[0]
  }).select()

  if (error) {
    console.error('Error creating client:', error)
    throw new Error("Failed")
  }

  revalidatePath('/clients')
  redirect(`/clients/${data[0].id}`)
}

export async function updateClient(id: string, formData: FormData) {
  const updates = {
    company_name: formData.get('company_name') as string,
    full_name: formData.get('full_name') as string,
    email: formData.get('email') as string,
    phone: formData.get('phone') as string,
    whatsapp: formData.get('whatsapp') as string,
    city: formData.get('city') as string,
    business_type: formData.get('business_type') as string,
    status: formData.get('status') as string,
  }

  const { error } = await (supabaseClient as any)
    .from('clients')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error("Failed")

  revalidatePath(`/clients/${id}`)
  revalidatePath('/clients')
}

export async function deleteClient(id: string) {
  const { error } = await (supabaseClient as any)
    .from('clients')
    .delete()
    .eq('id', id)

  if (error) throw new Error("Failed")

  revalidatePath('/clients')
  redirect('/clients')
}

export async function addClientService(clientId: string, serviceName: string) {
  const { error } = await (supabaseClient as any)
    .from('client_services')
    .insert({ client_id: clientId, service_name: serviceName })

  if (error) throw new Error("Failed")
  revalidatePath(`/clients/${clientId}`)
}

export async function updateClientStatus(id: string, status: string) {
  const { error } = await (supabaseClient as any)
    .from('clients')
    .update({ status })
    .eq('id', id)

  if (error) throw new Error("Failed")
  revalidatePath(`/clients/${id}`)
  revalidatePath('/clients')
}
