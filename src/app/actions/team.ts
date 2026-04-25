"use server"

import { supabaseClient } from "@/lib/supabase/client"
import { revalidatePath } from "next/cache"

export async function createTeamMember(formData: FormData) {
  const full_name = formData.get('full_name') as string
  const role = formData.get('role') as string
  const job_title = formData.get('job_title') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const whatsapp = formData.get('whatsapp') as string
  const status = formData.get('status') as string
  const salaryRaw = formData.get('salary') as string | null
  const salary = salaryRaw && salaryRaw.trim() ? parseFloat(salaryRaw) : null
  const salary_currency = (formData.get('salary_currency') as string) || 'SAR'

  const { error } = await (supabaseClient as any).from('team_members').insert({
    full_name,
    role,
    job_title,
    email,
    phone,
    whatsapp,
    status,
    salary,
    salary_currency,
  })

  if (error) throw new Error('Failed: ' + error.message)

  revalidatePath('/team')
}

export async function updateTeamMember(id: string, updates: any) {
  const { error } = await (supabaseClient as any)
    .from('team_members')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error("Failed")
  revalidatePath('/team')
}

export async function deleteTeamMember(id: string) {
  const { error } = await (supabaseClient as any)
    .from('team_members')
    .delete()
    .eq('id', id)

  if (error) throw new Error("Failed")
  revalidatePath('/team')
}
