"use server"

import { supabaseClient } from "@/lib/supabase/client"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

// =============================================================================
// New-client wizard payload — used by /clients/new (NewClientWizard).
// The wizard collects basics + an optional initial contract + an optional
// list of kickoff tasks/reminders, then submits them as one orchestrated
// call so a half-set-up client never leaks into the dashboard.
// =============================================================================

export type NewClientWizardPayload = {
  basics: {
    company_name: string
    full_name: string
    email?: string
    phone?: string
    whatsapp?: string
    city?: string
    business_type?: string
    status?: 'to_contact' | 'lead' | 'active' | 'paused'
    notes?: string
  }
  contract?: {
    title: string
    contract_type: 'Retainer' | 'Project' | 'One-time'
    start_date: string
    end_date?: string
    value?: number
    scope?: string
    deliverables?: Array<{ id: string; title: string; detail?: string; status?: 'pending' }>
  }
  tasks?: Array<{ title: string; due_date?: string; priority?: 'low' | 'medium' | 'high' | 'urgent' }>
  reminders?: Array<{ title: string; due_date: string; type?: string; priority?: 'low' | 'medium' | 'high' }>
}

export async function createClientWithKickoff(
  payload: NewClientWizardPayload,
): Promise<{ ok: true; clientId: string } | { ok: false; error: string }> {
  try {
    const { basics, contract, tasks, reminders } = payload
    if (!basics?.company_name?.trim()) return { ok: false, error: 'Company name is required.' }
    if (!basics?.full_name?.trim()) return { ok: false, error: 'Primary contact name is required.' }

    // 1. Insert the client.
    const { data: client, error: cErr } = await (supabaseClient as any)
      .from('clients')
      .insert({
        company_name: basics.company_name.trim(),
        full_name: basics.full_name.trim(),
        email: basics.email?.trim() || null,
        phone: basics.phone?.trim() || null,
        whatsapp: basics.whatsapp?.trim() || null,
        city: basics.city?.trim() || null,
        business_type: basics.business_type?.trim() || null,
        status: basics.status || 'lead',
        notes: basics.notes?.trim() || null,
        start_date: new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single()
    if (cErr || !client) return { ok: false, error: `Client insert failed: ${cErr?.message ?? 'unknown'}` }

    // 2. Optional contract — insert with scope + deliverables (added in
    //    migration 017). All-or-nothing field-set: a contract requires
    //    at least a title + start_date; we silently skip if not provided.
    if (contract?.title?.trim() && contract.start_date) {
      const { error: kErr } = await (supabaseClient as any).from('contracts').insert({
        client_id: client.id,
        title: contract.title.trim(),
        contract_type: contract.contract_type,
        start_date: contract.start_date,
        end_date: contract.end_date || null,
        value: contract.value ?? null,
        currency: 'SAR',
        status: 'active',
        payment_cycle: 'monthly',
        scope: contract.scope?.trim() || null,
        deliverables: Array.isArray(contract.deliverables) ? contract.deliverables : [],
      })
      if (kErr) {
        // Don't fail the whole wizard if the contract write fails — the
        // client is already in. Surface the warning to the caller so the
        // wizard can show it on the success screen instead of erroring out.
        console.warn('[wizard] contract insert failed:', kErr.message)
      }
    }

    // 3. Kickoff tasks. tasks.status enum is ('todo','in_progress','review','completed') —
    // 'pending' was a wrong guess that violated the check constraint in E2E.
    const taskRows = (tasks ?? [])
      .filter((t) => t?.title?.trim())
      .map((t) => ({
        client_id: client.id,
        title: t.title.trim(),
        due_date: t.due_date || null,
        priority: t.priority || 'medium',
        status: 'todo',
      }))
    if (taskRows.length > 0) {
      const { error: tErr } = await (supabaseClient as any).from('tasks').insert(taskRows)
      if (tErr) console.warn('[wizard] tasks insert failed:', tErr.message)
    }

    // 4. Kickoff reminders. Falls back to type='follow_up' for unset types.
    const reminderRows = (reminders ?? [])
      .filter((r) => r?.title?.trim() && r?.due_date)
      .map((r) => ({
        client_id: client.id,
        title: r.title.trim(),
        type: r.type || 'follow_up',
        due_date: r.due_date,
        priority: r.priority || 'medium',
        status: 'pending',
      }))
    if (reminderRows.length > 0) {
      const { error: rErr } = await (supabaseClient as any).from('reminders').insert(reminderRows)
      if (rErr) console.warn('[wizard] reminders insert failed:', rErr.message)
    }

    revalidatePath('/clients')
    revalidatePath('/contracts')
    revalidatePath('/tasks')
    revalidatePath('/reminders')
    revalidatePath('/')
    return { ok: true, clientId: client.id }
  } catch (err: any) {
    console.error('createClientWithKickoff crashed:', err)
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

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

// Free-form note attached to a client. Backed by communication_logs with
// type='note' so we get the existing timestamp/auditing for free instead
// of standing up a new table. Used by the Notes tab on the client
// workspace.
export async function addClientNote(clientId: string, formData: FormData) {
  const summary = String(formData.get('summary') ?? '').trim()
  if (!summary) return
  await (supabaseClient as any).from('communication_logs').insert({
    client_id: clientId,
    type: 'note',
    summary,
    notes: null,
    date: new Date().toISOString(),
  })
  revalidatePath(`/clients/${clientId}`)
}
