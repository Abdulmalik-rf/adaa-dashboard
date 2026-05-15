'use server'

import { agentSupabase } from '@/lib/chat-agent/supabase'
import { getCurrentUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// =============================================================================
// HR module — Phase 1 server actions.
//   • Leave requests: request → admin approves/rejects → balance decrements
//   • Payroll records: bulk generate for a month → mark paid one-by-one
// All writes go through the service-role client so RLS can't silently block.
// Application-level auth is enforced via getCurrentUser() + role checks.
// =============================================================================

function sb() {
  return agentSupabase()
}

// Inclusive day count between two ISO dates. Saudi labour practice: start
// and end are both working days, so 1-day leave = same start_date+end_date.
function daysBetween(startIso: string, endIso: string): number {
  const a = new Date(startIso + 'T00:00:00Z')
  const b = new Date(endIso + 'T00:00:00Z')
  const ms = b.getTime() - a.getTime()
  if (ms < 0) return 0
  return Math.floor(ms / 86_400_000) + 1
}

// =============================================================================
// LEAVE REQUESTS
// =============================================================================

export async function requestLeave(input: {
  employee_id: string
  type?: 'annual' | 'sick' | 'unpaid' | 'personal' | 'maternity' | 'paternity' | 'bereavement' | 'hajj' | 'other'
  start_date: string
  end_date: string
  reason?: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (!me) return { ok: false, error: 'Not signed in.' }
    if (!input.employee_id) return { ok: false, error: 'employee_id is required.' }
    if (!input.start_date || !input.end_date) return { ok: false, error: 'Start and end dates are required.' }

    const days = daysBetween(input.start_date, input.end_date)
    if (days < 1) return { ok: false, error: 'End date must be on or after start date.' }

    const { data, error } = await sb()
      .from('leave_requests')
      .insert({
        employee_id: input.employee_id,
        type: input.type || 'annual',
        start_date: input.start_date,
        end_date: input.end_date,
        days,
        status: 'pending',
        reason: input.reason?.trim() || null,
      })
      .select('id')
      .single()
    if (error) return { ok: false, error: `Save failed: ${error.message}` }

    // Notify admins so an approval request lands in the bell + on WhatsApp.
    try {
      await sb().from('notifications').insert({
        user_id: null, // admin-broadcast
        title: 'Leave request pending',
        message: `${days}-day ${input.type || 'annual'} leave request submitted for review.`,
        type: 'leave_pending_review',
        related_id: (data as any).id,
        is_read: false,
      })
    } catch { /* notification is best-effort */ }

    revalidatePath('/hr')
    revalidatePath('/notifications')
    return { ok: true, id: (data as any).id }
  } catch (err: any) {
    console.error('requestLeave crashed:', err)
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function approveLeaveRequest(
  id: string,
  decision_note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Only admins can approve leave.' }

    // Fetch first so we know employee + days for the balance decrement.
    const { data: lr, error: fErr } = await sb()
      .from('leave_requests')
      .select('id, employee_id, type, days, status')
      .eq('id', id)
      .maybeSingle()
    if (fErr || !lr) return { ok: false, error: `Leave request not found: ${fErr?.message ?? id}` }
    if ((lr as any).status !== 'pending') {
      return { ok: false, error: `Already ${(lr as any).status}.` }
    }

    const { error: uErr } = await sb()
      .from('leave_requests')
      .update({
        status: 'approved',
        decided_by: me.id,
        decided_at: new Date().toISOString(),
        decision_note: decision_note?.trim() || null,
      })
      .eq('id', id)
    if (uErr) return { ok: false, error: `Update failed: ${uErr.message}` }

    // Decrement the annual_leave_balance for annual leave only — other types
    // (sick, unpaid, etc.) don't draw from the statutory 21-day pool.
    if ((lr as any).type === 'annual') {
      const { data: emp } = await sb()
        .from('team_members')
        .select('annual_leave_balance, user_id, full_name')
        .eq('id', (lr as any).employee_id)
        .maybeSingle()
      const newBalance = Math.max(0, ((emp as any)?.annual_leave_balance ?? 21) - (lr as any).days)
      try {
        await sb()
          .from('team_members')
          .update({ annual_leave_balance: newBalance })
          .eq('id', (lr as any).employee_id)
      } catch { /* balance update is best-effort */ }

      // Ping the employee.
      const { data: empAuth } = await sb()
        .from('team_members')
        .select('user_id, full_name')
        .eq('id', (lr as any).employee_id)
        .maybeSingle()
      if ((empAuth as any)?.user_id) {
        try {
          await sb().from('notifications').insert({
            user_id: (empAuth as any).user_id,
            title: 'Leave approved ✓',
            message: `Your ${(lr as any).days}-day leave was approved. New balance: ${newBalance} days.`,
            type: 'leave_approved',
            related_id: id,
            is_read: false,
          })
        } catch { /* notification is best-effort */ }
      }
    }

    revalidatePath('/hr')
    revalidatePath('/notifications')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function rejectLeaveRequest(
  id: string,
  decision_note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Only admins can reject leave.' }

    const { data: lr } = await sb()
      .from('leave_requests')
      .select('id, employee_id, status')
      .eq('id', id)
      .maybeSingle()
    if (!lr) return { ok: false, error: 'Leave request not found.' }
    if ((lr as any).status !== 'pending') {
      return { ok: false, error: `Already ${(lr as any).status}.` }
    }

    const { error } = await sb()
      .from('leave_requests')
      .update({
        status: 'rejected',
        decided_by: me.id,
        decided_at: new Date().toISOString(),
        decision_note: decision_note?.trim() || null,
      })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }

    // Notify the employee.
    const { data: emp } = await sb()
      .from('team_members')
      .select('user_id')
      .eq('id', (lr as any).employee_id)
      .maybeSingle()
    if ((emp as any)?.user_id) {
      try {
        await sb().from('notifications').insert({
          user_id: (emp as any).user_id,
          title: 'Leave declined',
          message: decision_note?.trim() ? `Your leave request was declined: ${decision_note.trim()}` : 'Your leave request was declined.',
          type: 'leave_rejected',
          related_id: id,
          is_read: false,
        })
      } catch { /* notification is best-effort */ }
    }

    revalidatePath('/hr')
    revalidatePath('/notifications')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function cancelLeaveRequest(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (!me) return { ok: false, error: 'Not signed in.' }
    const { error } = await sb()
      .from('leave_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('status', 'pending') // only pending can be cancelled
    if (error) return { ok: false, error: error.message }
    revalidatePath('/hr')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// =============================================================================
// PAYROLL
// =============================================================================

// Generate one pending payroll row per active team member for the given
// month, using each employee's stored salary as the gross. Skips employees
// who already have a row for this period (upsert-style behavior). Returns
// how many rows were created vs. skipped so the admin sees the impact.
export async function generatePayrollForMonth(input: {
  year: number
  month: number // 1-12
}): Promise<
  | { ok: true; created: number; skipped: number; period: string }
  | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admins only.' }

    if (!Number.isInteger(input.year) || input.year < 2020 || input.year > 2100) {
      return { ok: false, error: 'Invalid year.' }
    }
    if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
      return { ok: false, error: 'Month must be 1-12.' }
    }

    // Active employees with a salary set.
    const { data: emps, error: eErr } = await sb()
      .from('team_members')
      .select('id, full_name, salary, salary_currency')
      .eq('status', 'active')
      .not('salary', 'is', null)
    if (eErr) return { ok: false, error: `Fetch employees failed: ${eErr.message}` }

    // Existing rows for this period — to skip duplicates.
    const { data: existing } = await sb()
      .from('payroll_records')
      .select('employee_id')
      .eq('period_year', input.year)
      .eq('period_month', input.month)
    const existingIds = new Set(((existing as any[]) ?? []).map((r) => r.employee_id))

    const toInsert = (emps as any[] ?? [])
      .filter((e) => !existingIds.has(e.id))
      .map((e) => ({
        employee_id: e.id,
        period_year: input.year,
        period_month: input.month,
        gross_amount: Number(e.salary ?? 0),
        deductions: 0,
        bonus: 0,
        currency: e.salary_currency || 'SAR',
        status: 'pending',
      }))

    let created = 0
    if (toInsert.length > 0) {
      const { error: iErr } = await sb().from('payroll_records').insert(toInsert)
      if (iErr) return { ok: false, error: `Insert failed: ${iErr.message}` }
      created = toInsert.length
    }

    revalidatePath('/hr')
    return {
      ok: true,
      created,
      skipped: existingIds.size,
      period: `${input.year}-${String(input.month).padStart(2, '0')}`,
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function markPayrollPaid(
  id: string,
  method?: string,
  paid_date?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admins only.' }

    const { data: row, error: fErr } = await sb()
      .from('payroll_records')
      .select('id, employee_id, net_amount, currency, status')
      .eq('id', id)
      .maybeSingle()
    if (fErr || !row) return { ok: false, error: `Payroll row not found: ${fErr?.message ?? id}` }
    if ((row as any).status === 'paid') return { ok: false, error: 'Already paid.' }

    const { error } = await sb()
      .from('payroll_records')
      .update({
        status: 'paid',
        paid_date: paid_date || new Date().toISOString().slice(0, 10),
        method: method?.trim() || 'bank_transfer',
      })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }

    // Ping the employee.
    const { data: emp } = await sb()
      .from('team_members')
      .select('user_id, full_name')
      .eq('id', (row as any).employee_id)
      .maybeSingle()
    if ((emp as any)?.user_id) {
      try {
        await sb().from('notifications').insert({
          user_id: (emp as any).user_id,
          title: 'Salary paid 💸',
          message: `Your salary of ${(row as any).net_amount} ${(row as any).currency} has been paid.`,
          type: 'payroll_paid',
          related_id: id,
          is_read: false,
        })
      } catch { /* notification is best-effort */ }
    }

    revalidatePath('/hr')
    revalidatePath('/notifications')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function updatePayrollRecord(
  id: string,
  patch: { gross_amount?: number; deductions?: number; bonus?: number; notes?: string; method?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admins only.' }
    const update: any = {}
    for (const k of ['gross_amount', 'deductions', 'bonus', 'notes', 'method']) {
      if ((patch as any)[k] !== undefined) update[k] = (patch as any)[k]
    }
    if (Object.keys(update).length === 0) return { ok: true }
    const { error } = await sb().from('payroll_records').update(update).eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/hr')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function deletePayrollRecord(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admins only.' }
    const { error } = await sb().from('payroll_records').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/hr')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}
