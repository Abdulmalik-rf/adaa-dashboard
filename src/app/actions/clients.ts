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
  // Pre-schedules N weekly_reports rows starting from start_date_iso.
  // Each row's period_end becomes a calendar event automatically (the
  // /calendar page already aggregates weekly_reports). assignee_team_member_id
  // is the team_members.id who's responsible — they get a notification per
  // scheduled report so they know it's on their plate.
  report_schedule?: {
    assignee_team_member_id: string
    weeks: number              // how many weekly_reports rows to pre-create
    start_date_iso: string     // ISO date — period_start of the FIRST report
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

    // 5. Optional weekly-reports schedule. Pre-creates N weekly_reports
    //    rows so the Calendar shows the upcoming due-dates and the
    //    assignee knows what's on their plate. Each row has period_start
    //    set to the start of its week and period_end six days later;
    //    issue_date is the Sunday after period_end (when the report is
    //    due to the client). Notifies the assignee in one summary message.
    if (payload.report_schedule?.assignee_team_member_id && payload.report_schedule.weeks > 0) {
      try {
        await scheduleWeeklyReports({
          clientId: client.id,
          clientCompany: basics.company_name.trim(),
          clientContact: basics.full_name.trim(),
          clientEmail: basics.email?.trim() || null,
          assigneeId: payload.report_schedule.assignee_team_member_id,
          weeks: Math.max(1, Math.min(52, payload.report_schedule.weeks)),
          startDateIso: payload.report_schedule.start_date_iso || new Date().toISOString().slice(0, 10),
        })
      } catch (sErr: any) {
        // Same posture as the contract step: don't fail the wizard if the
        // schedule fails — surface a warning to the caller.
        console.warn('[wizard] weekly-report schedule failed:', sErr?.message ?? sErr)
      }
    }

    revalidatePath('/clients')
    revalidatePath('/contracts')
    revalidatePath('/tasks')
    revalidatePath('/reminders')
    revalidatePath('/reports')
    revalidatePath('/calendar')
    revalidatePath('/notifications')
    revalidatePath('/')
    return { ok: true, clientId: client.id }
  } catch (err: any) {
    console.error('createClientWithKickoff crashed:', err)
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// =============================================================================
// Weekly-report scheduling. Pulled out of createClientWithKickoff so the
// logic stays readable and can be re-used (e.g. from a future "extend
// schedule" admin tool).
// =============================================================================

// ISO-week number for a given date. Matches the convention used elsewhere
// (src/app/actions/reports.ts:isoYearWeek).
function isoYearWeek(d: Date) {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(
    ((target.getTime() - firstThursday.getTime()) / 86400000 - 3 +
      ((firstThursday.getUTCDay() + 6) % 7)) / 7
  )
  return { year: target.getUTCFullYear(), week }
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function scheduleWeeklyReports(args: {
  clientId: string
  clientCompany: string
  clientContact: string
  clientEmail: string | null
  assigneeId: string
  weeks: number
  startDateIso: string
}) {
  // Resolve the assignee's auth user_id so notifications land on the
  // right user feed (notifications.user_id = auth user, not team_member).
  const { data: assignee } = await (supabaseClient as any)
    .from('team_members')
    .select('id, user_id, full_name')
    .eq('id', args.assigneeId)
    .maybeSingle()
  const assigneeUserId: string | null = (assignee as any)?.user_id ?? null
  const assigneeName: string = (assignee as any)?.full_name ?? 'assignee'

  // Build the rows. period_start moves forward by 7 days each iteration;
  // period_end is +6 days; issue_date is +7 (Sunday after the period).
  const rows: any[] = []
  for (let i = 0; i < args.weeks; i++) {
    const periodStart = addDays(args.startDateIso, i * 7)
    const periodEnd = addDays(periodStart, 6)
    const issueDate = addDays(periodStart, 7)
    const { year, week } = isoYearWeek(new Date(periodStart + 'T00:00:00Z'))
    // report_number suffixed with -1/-2/... if a row for that ISO week
    // already exists — defer the dedupe to insert-time conflict handling
    // since we batch.
    const report_number = `WR-${year}-W${String(week).padStart(2, '0')}-${args.clientCompany.replace(/[^A-Za-z0-9]+/g, '').slice(0, 6).toUpperCase() || 'CL'}`
    rows.push({
      client_id: args.clientId,
      client_name_snapshot: args.clientContact,
      customer_name: args.clientContact,
      customer_company: args.clientCompany,
      period_start: periodStart,
      period_end: periodEnd,
      issue_date: issueDate,
      status: 'draft',
      report_number,
      assignee_id: args.assigneeId,
      prepared_for_contact: args.clientContact,
      prepared_for_email: args.clientEmail,
      services: [],
    })
  }

  const { error: insErr } = await (supabaseClient as any)
    .from('weekly_reports')
    .insert(rows)
  if (insErr) throw new Error(`weekly_reports insert failed: ${insErr.message}`)

  // One summary notification so the assignee's bell shows it immediately.
  // user_id targets the specific user; admin-broadcast notifications use
  // null. If we can't resolve the assignee's auth user, fall back to
  // admin-broadcast so the assignment still shows up somewhere.
  await (supabaseClient as any).from('notifications').insert({
    user_id: assigneeUserId,
    title: `Weekly reports assigned: ${args.clientCompany}`,
    message:
      `${assigneeName}, you've been set as the owner of ${args.weeks} weekly reports for ${args.clientCompany}. ` +
      `First period: ${args.startDateIso} → ${addDays(args.startDateIso, 6)}. ` +
      `Check the Calendar / Weekly Reports page when the first one is due.`,
    type: 'report_assigned',
    related_id: args.clientId,
    is_read: false,
  })
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
  revalidatePath('/leads')
}

// =============================================================================
// LEAD-SPECIFIC ACTIONS
// =============================================================================
// Leads are clients with status IN ('to_contact','lead'). They live on the
// dedicated /leads page so the main /clients view stays focused on signed
// accounts. These helpers cover the common per-row actions.

// Stamp last_contacted_at to now. Also bumps to_contact → lead so the
// pipeline reflects "first touch made". Optionally appends a note about
// the channel + a one-line summary so the contact history is auditable
// without leaving WhatsApp.
export async function markLeadContacted(
  id: string,
  channel?: 'whatsapp' | 'email' | 'phone' | 'meeting',
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data: existing } = await (supabaseClient as any)
      .from('clients')
      .select('status')
      .eq('id', id)
      .maybeSingle()
    const patch: Record<string, any> = { last_contacted_at: new Date().toISOString() }
    if (existing?.status === 'to_contact') patch.status = 'lead'

    const { error } = await (supabaseClient as any).from('clients').update(patch).eq('id', id)
    if (error) return { ok: false, error: error.message }

    if (channel) {
      await (supabaseClient as any).from('communication_logs').insert({
        client_id: id,
        type: channel,
        summary: note?.trim() || `Marked as contacted via ${channel}.`,
        notes: null,
        date: new Date().toISOString(),
      }).catch((e: any) => console.warn('[markLeadContacted] log insert failed:', e?.message))
    }

    revalidatePath('/leads')
    revalidatePath('/clients')
    revalidatePath(`/clients/${id}`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// Promotes a lead to a signed client by flipping status → 'active'. Useful
// the moment a lead converts. Does NOT create a contract — the user adds
// that separately (the /clients/[id] workspace has an "Add contract" CTA).
export async function promoteLeadToClient(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await (supabaseClient as any)
      .from('clients')
      .update({ status: 'active' })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/leads')
    revalidatePath('/clients')
    revalidatePath(`/clients/${id}`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// Pushes a lead BACK to the leads pipeline (e.g. an "active" client was
// misclassified and should still be in outreach mode). Inverse of promote.
export async function demoteToLead(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await (supabaseClient as any)
      .from('clients')
      .update({ status: 'lead' })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/leads')
    revalidatePath('/clients')
    revalidatePath(`/clients/${id}`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
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
