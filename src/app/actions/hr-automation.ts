'use server'

// Dashboard server actions for the new HR-automation features (F4–F12).
// These mirror the WhatsApp-agent executors so the dashboard buttons can
// trigger the same workflows without going through WhatsApp.

import { agentSupabase } from '@/lib/chat-agent/supabase'
import { getCurrentUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email'

const sb = () => agentSupabase()

function daysBetweenInclusive(a: string, b: string): number {
  const ad = new Date(a + 'T00:00:00Z').getTime()
  const bd = new Date(b + 'T00:00:00Z').getTime()
  if (Number.isNaN(ad) || Number.isNaN(bd)) return 0
  return Math.floor((bd - ad) / 86_400_000) + 1
}

// =============================================================================
// F4: Auto-payroll with KSA rules
// =============================================================================

export async function generateAutoPayroll(input: { year: number; month: number }): Promise<
  { ok: true; period: string; generated: number } | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
    const { year, month } = input
    if (!year || !month || month < 1 || month > 12) return { ok: false, error: 'Pass valid year + month.' }

    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const { data: emps } = await sb()
      .from('team_members')
      .select('id, full_name, base_salary, salary_currency, housing_allowance, transport_allowance, other_allowances, gosi_subject, employment_type, hire_date, status')
      .eq('status', 'active')

    let generated = 0
    for (const e of ((emps as any[]) ?? [])) {
      const baseSalary = Number(e.base_salary ?? 0)
      if (!baseSalary) continue

      const housing = Number(e.housing_allowance ?? 0)
      const transport = Number(e.transport_allowance ?? 0)
      const other = Number(e.other_allowances ?? 0)
      const gross = baseSalary + housing + transport + other

      const { data: existing } = await sb()
        .from('payroll_records')
        .select('id, status')
        .eq('employee_id', e.id).eq('period_year', year).eq('period_month', month)
        .maybeSingle()
      if (existing && (existing as any).status === 'paid') continue

      const gosiPct = e.gosi_subject === 'saudi' ? 0.09 : 0
      const gosi = Math.round(baseSalary * gosiPct * 100) / 100

      const { data: unpaid } = await sb()
        .from('leave_requests')
        .select('start_date, end_date, days, type, status')
        .eq('employee_id', e.id).eq('type', 'unpaid').eq('status', 'approved')
        .lte('start_date', periodEnd).gte('end_date', periodStart)
      let unpaidDays = 0
      for (const u of ((unpaid as any[]) ?? [])) {
        const from = u.start_date < periodStart ? periodStart : u.start_date
        const to = u.end_date > periodEnd ? periodEnd : u.end_date
        unpaidDays += daysBetweenInclusive(from, to)
      }
      const dailyRate = gross / 30
      const unpaidDeduction = Math.round(unpaidDays * dailyRate * 100) / 100

      // EOSB accrual (informational)
      const hire = e.hire_date ? new Date(e.hire_date + 'T00:00:00Z').getTime() : null
      const asOf = new Date(periodEnd + 'T00:00:00Z').getTime()
      const yearsServed = hire ? Math.max(0, (asOf - hire) / (365.25 * 86_400_000)) : 0
      const monthlyEosb = yearsServed > 5 ? baseSalary / 12 : baseSalary / 24

      const deductions = gosi + unpaidDeduction
      const upsertRow = {
        employee_id: e.id,
        period_year: year,
        period_month: month,
        gross_amount: gross,
        deductions,
        bonus: 0,
        status: 'pending',
        currency: e.salary_currency || 'SAR',
      }
      const { data: prow, error: pErr } = await sb()
        .from('payroll_records')
        .upsert(upsertRow as any, { onConflict: 'employee_id,period_year,period_month' })
        .select('id').single()
      if (pErr || !prow) continue

      await sb().from('payroll_line_items').delete().eq('payroll_id', (prow as any).id)
      const lines: any[] = [
        { kind: 'base', label: 'Base salary', label_ar: 'الراتب الأساسي', amount: baseSalary, is_deduction: false, position: 0 },
      ]
      if (housing)   lines.push({ kind: 'housing',   label: 'Housing allowance',     label_ar: 'بدل سكن',           amount: housing,   is_deduction: false, position: 1 })
      if (transport) lines.push({ kind: 'transport', label: 'Transport allowance',   label_ar: 'بدل نقل',           amount: transport, is_deduction: false, position: 2 })
      if (other)     lines.push({ kind: 'allowance', label: 'Other allowances',      label_ar: 'بدلات أخرى',        amount: other,     is_deduction: false, position: 3 })
      if (gosi)      lines.push({ kind: 'gosi_employee', label: 'GOSI (9% employee)', label_ar: 'تأمينات اجتماعية', amount: gosi,      is_deduction: true,  position: 4 })
      if (unpaidDeduction) lines.push({ kind: 'unpaid_leave', label: `Unpaid leave (${unpaidDays}d)`, label_ar: `إجازة بدون راتب (${unpaidDays} يوم)`, amount: unpaidDeduction, is_deduction: true, position: 5 })
      lines.push({ kind: 'eosb_accrual', label: 'EOSB accrual (informational)', label_ar: 'مخصص نهاية الخدمة (للعلم)', amount: Math.round(monthlyEosb * 100) / 100, is_deduction: false, position: 9, meta: { informational: true } })

      const linesToInsert = lines.map((l: any) => ({ ...l, payroll_id: (prow as any).id }))
      await sb().from('payroll_line_items').insert(linesToInsert)
      generated++
    }
    revalidatePath('/hr')
    return { ok: true, period: `${year}-${String(month).padStart(2, '0')}`, generated }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// =============================================================================
// F5: EOSB snapshot for one employee (or all active employees)
// =============================================================================

export async function refreshEosbSnapshot(input: { employee_id?: string }): Promise<
  { ok: true; rows: number } | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
    const today = new Date().toISOString().slice(0, 10)

    let query = sb()
      .from('team_members')
      .select('id, base_salary, salary_currency, hire_date, status')
      .eq('status', 'active')
    if (input.employee_id) query = query.eq('id', input.employee_id)
    const { data: emps, error } = await query
    if (error) return { ok: false, error: error.message }

    let n = 0
    for (const e of ((emps as any[]) ?? [])) {
      const hire = e.hire_date ? new Date(e.hire_date + 'T00:00:00Z').getTime() : null
      const asOf = new Date(today + 'T00:00:00Z').getTime()
      if (!hire || asOf <= hire) continue
      const yearsServed = (asOf - hire) / (365.25 * 86_400_000)
      const monthly = Number(e.base_salary ?? 0)
      if (!monthly) continue
      const accrued = yearsServed <= 5
        ? monthly * 0.5 * yearsServed
        : monthly * 0.5 * 5 + monthly * 1.0 * (yearsServed - 5)
      await sb().from('eosb_snapshots').upsert({
        employee_id: e.id,
        as_of_date: today,
        years_served: Math.round(yearsServed * 1000) / 1000,
        monthly_salary: monthly,
        accrued_amount: Math.round(accrued * 100) / 100,
        currency: e.salary_currency || 'SAR',
      } as any, { onConflict: 'employee_id,as_of_date' })
      n++
    }
    revalidatePath('/hr/eosb')
    return { ok: true, rows: n }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// =============================================================================
// F6: Send salary slip — dashboard-side wrapper. Sends an HTML email to the
// employee with their breakdown. (WhatsApp delivery happens in the agent.)
// =============================================================================

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c),
  )
}

export async function sendSalarySlipEmail(input: { payroll_id: string }): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }

    const { data: pay } = await sb()
      .from('payroll_records')
      .select('id, period_year, period_month, gross_amount, deductions, bonus, net_amount, currency, status, paid_date, method, team_members:employee_id (id, full_name, full_name_ar, job_title, job_title_ar, email, bank_iban)')
      .eq('id', input.payroll_id).maybeSingle()
    if (!pay) return { ok: false, error: 'Payroll record not found.' }

    const emp = (pay as any).team_members
    if (!emp?.email) return { ok: false, error: 'Employee has no email on file.' }

    const { data: lines } = await sb()
      .from('payroll_line_items')
      .select('label, label_ar, amount, is_deduction')
      .eq('payroll_id', input.payroll_id).order('position')

    const period = `${(pay as any).period_year}-${String((pay as any).period_month).padStart(2, '0')}`
    const monthName = new Date(Date.UTC((pay as any).period_year, (pay as any).period_month - 1, 1))
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

    const ts = ((lines as any[]) ?? []).map((l) => `
      <tr><td style="padding:6px 8px;border-top:1px solid #eee;">${escapeHtml(l.label)}</td>
      <td style="padding:6px 8px;border-top:1px solid #eee;text-align:right;direction:rtl;">${escapeHtml(l.label_ar || '')}</td>
      <td style="padding:6px 8px;border-top:1px solid #eee;text-align:right;color:${l.is_deduction ? '#b91c1c' : '#16a34a'};">${l.is_deduction ? '−' : ''}${Number(l.amount).toLocaleString('en-US')}</td></tr>
    `).join('')

    const html = `<html><body style="font-family:Inter,Arial;background:#f8fafc;padding:24px;color:#0f172a">
      <div style="max-width:640px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#000;color:#bef264;padding:18px 24px;font-weight:900;">Emergize SALARY SLIP · ${escapeHtml(period)}</div>
      <div style="padding:24px;">
        <p style="font-size:14px;"><b>${escapeHtml(emp.full_name || '')}</b>${emp.job_title ? ` — ${escapeHtml(emp.job_title)}` : ''}</p>
        <p style="font-size:12px;color:#64748b;">Period: ${escapeHtml(monthName)}${(pay as any).paid_date ? ` · Paid: ${(pay as any).paid_date}` : ''}</p>
        <table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:12px;">
          <thead><tr style="background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">
            <th style="padding:8px;text-align:left;">Item</th><th style="padding:8px;text-align:right;">البند</th><th style="padding:8px;text-align:right;">${escapeHtml((pay as any).currency || 'SAR')}</th>
          </tr></thead>
          <tbody>${ts}</tbody>
        </table>
        <div style="margin-top:18px;padding:12px 14px;background:#ecfdf5;border-left:4px solid #16a34a;border-radius:6px;display:flex;justify-content:space-between;font-weight:900;">
          <span>Net · صافي</span><span>${Number((pay as any).net_amount ?? 0).toLocaleString('en-US')} ${(pay as any).currency || 'SAR'}</span>
        </div>
      </div></div></body></html>`

    const r = await sendEmail({
      to: emp.email,
      subject: `Salary slip · ${monthName} · ${Number((pay as any).net_amount ?? 0).toLocaleString('en-US')} ${(pay as any).currency || 'SAR'}`,
      text: `Your ${monthName} salary slip. Net pay: ${Number((pay as any).net_amount ?? 0).toLocaleString('en-US')} ${(pay as any).currency || 'SAR'}.`,
      html,
    })
    if (!r.ok) return { ok: false, error: r.error ?? 'Email send failed.' }

    await sb().from('payroll_records').update({
      slip_sent_at: new Date().toISOString(),
      slip_channel: 'email',
    } as any).eq('id', input.payroll_id)
    revalidatePath('/hr')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// =============================================================================
// F7: Onboarding — start checklist from dashboard
// =============================================================================

const ONBOARDING_TEMPLATES: Record<string, Array<{ title: string; title_ar: string; category: string; owner_role: string; due_offset_days: number }>> = {
  saudi_full_time: [
    { title: 'Sign employment contract',       title_ar: 'توقيع عقد العمل',                    category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Collect national_id copy',       title_ar: 'استلام نسخة الهوية الوطنية',         category: 'paperwork',  owner_role: 'admin',    due_offset_days: 1 },
    { title: 'GOSI registration',              title_ar: 'تسجيل التأمينات الاجتماعية',         category: 'compliance', owner_role: 'finance',  due_offset_days: 7 },
    { title: 'Collect bank IBAN form',         title_ar: 'استلام نموذج رقم الآيبان',           category: 'paperwork',  owner_role: 'finance',  due_offset_days: 3 },
    { title: 'Set up @emergize-sa.com email',  title_ar: 'إنشاء بريد العمل',                  category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Sign NDA / IP agreement',        title_ar: 'توقيع اتفاقية السرية',               category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Equipment handover (laptop)',    title_ar: 'تسليم الأجهزة',                      category: 'orientation',owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Add to WhatsApp + Slack channels', title_ar: 'إضافته إلى مجموعات واتساب وسلاك', category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Intro 1:1 with manager',         title_ar: 'لقاء تعريفي مع المدير',              category: 'orientation',owner_role: 'manager',  due_offset_days: 3 },
    { title: 'First-week training plan',       title_ar: 'خطة تدريب الأسبوع الأول',            category: 'orientation',owner_role: 'manager',  due_offset_days: 7 },
    { title: '30-day check-in',                title_ar: 'مراجعة بعد 30 يوم',                  category: 'orientation',owner_role: 'manager',  due_offset_days: 30 },
  ],
  expat_full_time: [
    { title: 'Sign employment contract',       title_ar: 'توقيع عقد العمل',                    category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Collect passport copy',          title_ar: 'استلام نسخة الجواز',                 category: 'paperwork',  owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Apply for / transfer iqama',     title_ar: 'إصدار / نقل الإقامة',                category: 'compliance', owner_role: 'admin',    due_offset_days: 14 },
    { title: 'Apply for visa stamping',        title_ar: 'إصدار تأشيرة العمل',                category: 'compliance', owner_role: 'admin',    due_offset_days: 21 },
    { title: 'GOSI registration (2% employer)',title_ar: 'تسجيل التأمينات (2% صاحب العمل)',    category: 'compliance', owner_role: 'finance',  due_offset_days: 7 },
    { title: 'Medical insurance enrollment',   title_ar: 'تسجيل التأمين الطبي',                category: 'compliance', owner_role: 'admin',    due_offset_days: 14 },
    { title: 'Collect bank IBAN form',         title_ar: 'استلام نموذج رقم الآيبان',           category: 'paperwork',  owner_role: 'finance',  due_offset_days: 3 },
    { title: 'Set up @emergize-sa.com email',  title_ar: 'إنشاء بريد العمل',                  category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Sign NDA / IP agreement',        title_ar: 'توقيع اتفاقية السرية',               category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Equipment handover (laptop)',    title_ar: 'تسليم الأجهزة',                      category: 'orientation',owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Add to WhatsApp + Slack channels', title_ar: 'إضافته إلى مجموعات واتساب وسلاك', category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Intro 1:1 with manager',         title_ar: 'لقاء تعريفي مع المدير',              category: 'orientation',owner_role: 'manager',  due_offset_days: 3 },
    { title: '30-day check-in',                title_ar: 'مراجعة بعد 30 يوم',                  category: 'orientation',owner_role: 'manager',  due_offset_days: 30 },
  ],
  part_time: [
    { title: 'Sign part-time contract',        title_ar: 'توقيع عقد جزئي',                     category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Collect ID copy',                title_ar: 'استلام نسخة الهوية',                category: 'paperwork',  owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Set up @emergize-sa.com email',  title_ar: 'إنشاء بريد العمل',                  category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Define working hours / schedule',title_ar: 'تحديد ساعات العمل',                 category: 'orientation',owner_role: 'manager',  due_offset_days: 2 },
  ],
  intern: [
    { title: 'Sign internship agreement',      title_ar: 'توقيع عقد التدريب',                 category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Collect ID copy',                title_ar: 'استلام نسخة الهوية',                category: 'paperwork',  owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Assign mentor',                  title_ar: 'تعيين موجِّه',                       category: 'orientation',owner_role: 'manager',  due_offset_days: 1 },
    { title: 'Set up dashboard access',        title_ar: 'إعداد صلاحيات النظام',              category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
  ],
  contractor: [
    { title: 'Sign contractor agreement',      title_ar: 'توقيع عقد المقاول',                 category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Collect CR / freelance license', title_ar: 'استلام السجل التجاري',               category: 'paperwork',  owner_role: 'admin',    due_offset_days: 3 },
    { title: 'Confirm payment terms + IBAN',   title_ar: 'تأكيد شروط الدفع والآيبان',          category: 'paperwork',  owner_role: 'finance',  due_offset_days: 1 },
    { title: 'Project scope brief',            title_ar: 'إيضاح نطاق المشروع',                 category: 'orientation',owner_role: 'manager',  due_offset_days: 1 },
  ],
}

export async function startOnboardingChecklist(input: { employee_id: string; template?: string }): Promise<
  { ok: true; checklist_id: string; items: number } | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }

    const { data: emp } = await sb()
      .from('team_members')
      .select('id, full_name, employment_type, nationality, hire_date')
      .eq('id', input.employee_id).maybeSingle()
    if (!emp) return { ok: false, error: 'Employee not found.' }

    let template = input.template
    if (!template) {
      const isSaudi = String((emp as any).nationality || '').toLowerCase().includes('saudi') || (emp as any).nationality === 'SA'
      const et = (emp as any).employment_type || 'full_time'
      if (et === 'intern') template = 'intern'
      else if (et === 'contractor') template = 'contractor'
      else if (et === 'part_time') template = 'part_time'
      else template = isSaudi ? 'saudi_full_time' : 'expat_full_time'
    }
    if (!ONBOARDING_TEMPLATES[template]) return { ok: false, error: `Unknown template: ${template}` }

    const { data: existing } = await sb()
      .from('onboarding_checklists').select('id').eq('employee_id', input.employee_id).maybeSingle()
    if (existing) {
      return { ok: true, checklist_id: (existing as any).id, items: 0 }
    }

    const { data: chk, error } = await sb()
      .from('onboarding_checklists')
      .insert({ employee_id: input.employee_id, template, status: 'in_progress' } as any)
      .select('id').single()
    if (error || !chk) return { ok: false, error: error?.message ?? 'create failed' }

    const tpl = ONBOARDING_TEMPLATES[template]
    const items = tpl.map((it, idx) => ({
      checklist_id: (chk as any).id,
      position: idx,
      title: it.title,
      title_ar: it.title_ar,
      category: it.category,
      owner_role: it.owner_role,
      due_offset_days: it.due_offset_days,
      done: false,
    }))
    await sb().from('onboarding_checklist_items').insert(items as any)

    revalidatePath('/hr/onboarding')
    revalidatePath('/hr')
    return { ok: true, checklist_id: (chk as any).id, items: items.length }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function toggleOnboardingItem(input: { item_id: string; done: boolean }): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
    const { error } = await sb().from('onboarding_checklist_items').update({
      done: input.done,
      done_at: input.done ? new Date().toISOString() : null,
    } as any).eq('id', input.item_id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/hr/onboarding')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// =============================================================================
// F10: Candidates — promote to employee
// =============================================================================

export async function promoteCandidateToEmployee(input: {
  candidate_id: string
  job_title?: string
  base_salary?: number
  hire_date?: string
  employment_type?: string
}): Promise<{ ok: true; team_member_id: string } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
    const { data: cand } = await sb().from('candidates').select('*').eq('id', input.candidate_id).maybeSingle()
    if (!cand) return { ok: false, error: 'Candidate not found.' }
    if ((cand as any).status === 'hired') return { ok: false, error: 'Already hired.' }

    const teamRow = {
      full_name: (cand as any).full_name,
      email: (cand as any).email,
      phone: (cand as any).phone,
      whatsapp: (cand as any).whatsapp,
      job_title: input.job_title ?? (cand as any).current_title,
      base_salary: input.base_salary ?? (cand as any).asking_salary,
      salary_currency: (cand as any).salary_currency || 'SAR',
      hire_date: input.hire_date || new Date().toISOString().slice(0, 10),
      employment_type: input.employment_type || 'full_time',
      nationality: (cand as any).nationality,
      status: 'active',
    }
    const { data: tm, error: tErr } = await sb().from('team_members').insert(teamRow as any).select('id').single()
    if (tErr || !tm) return { ok: false, error: tErr?.message ?? 'create failed' }

    await sb().from('candidates').update({
      status: 'hired',
      promoted_to_team_member_id: (tm as any).id,
    } as any).eq('id', input.candidate_id)

    // Auto-start onboarding
    await startOnboardingChecklist({ employee_id: (tm as any).id })

    revalidatePath('/hr/candidates')
    revalidatePath('/hr/onboarding')
    revalidatePath('/team')
    return { ok: true, team_member_id: (tm as any).id }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function updateCandidate(input: {
  id: string
  status?: string
  rating?: number
  notes?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
    const patch: any = {}
    if (input.status) patch.status = input.status
    if (input.rating !== undefined) patch.rating = input.rating
    if (input.notes !== undefined) patch.notes = input.notes
    const { error } = await sb().from('candidates').update(patch).eq('id', input.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/hr/candidates')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// =============================================================================
// F11: HR letters — flip draft to sent
// =============================================================================

export async function updateHrLetter(input: {
  id: string
  body_en?: string
  body_ar?: string
  status?: 'draft' | 'sent' | 'signed' | 'superseded' | 'void'
  delivered_channel?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
    const patch: any = {}
    if (input.body_en !== undefined) patch.body_en = input.body_en
    if (input.body_ar !== undefined) patch.body_ar = input.body_ar
    if (input.status) {
      patch.status = input.status
      if (input.status === 'sent') patch.delivered_at = new Date().toISOString()
    }
    if (input.delivered_channel) patch.delivered_channel = input.delivered_channel
    const { error } = await sb().from('hr_letters').update(patch).eq('id', input.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/hr/letters')
    revalidatePath(`/hr/letters/${input.id}`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// =============================================================================
// F8: Performance brief — builds 1-on-1 prep doc from CRM data
// =============================================================================

export async function buildPerformanceBrief(input: { employee_id: string; days?: number }): Promise<
  { ok: true; brief: string; metrics: Record<string, any> } | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }

    const days = Math.max(7, Math.min(180, input.days ?? 30))
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)

    const { data: emp } = await sb()
      .from('team_members').select('id, full_name, job_title, hire_date').eq('id', input.employee_id).maybeSingle()
    if (!emp) return { ok: false, error: 'Employee not found.' }
    const empAny = emp as any

    const [{ data: tasksClosed }, { data: tasksOpen }, { data: leave }, { data: lateness }] = await Promise.all([
      sb().from('tasks').select('id, title, status, updated_at, clients:client_id (company_name)')
        .eq('assignee_id', input.employee_id).eq('status', 'completed').gte('updated_at', since),
      sb().from('tasks').select('id, title, status, due_date, priority')
        .eq('assignee_id', input.employee_id).neq('status', 'completed').limit(20),
      sb().from('leave_requests').select('start_date, end_date, days, type')
        .eq('employee_id', input.employee_id).eq('status', 'approved').gte('start_date', since),
      sb().from('attendance_logs').select('log_date, status, late_minutes')
        .eq('employee_id', input.employee_id).gte('log_date', since),
    ])

    let reports: any[] = []
    try {
      const r = await sb().from('weekly_reports')
        .select('id, period_end, customer_company').eq('assignee_id', input.employee_id).gte('period_end', since)
      reports = (r.data as any[]) ?? []
    } catch {}
    let content: any[] = []
    try {
      const c = await sb().from('content_items')
        .select('id, title, platform, publish_date').eq('assignee_id', input.employee_id).gte('publish_date', since)
      content = (c.data as any[]) ?? []
    } catch {}

    const tc = (tasksClosed as any[]) ?? []
    const to = (tasksOpen as any[]) ?? []
    const lv = (leave as any[]) ?? []
    const at = (lateness as any[]) ?? []
    const lateCount = at.filter((a) => a.status === 'late').length
    const lateMinutes = at.reduce((s, a) => s + (Number(a.late_minutes) || 0), 0)
    const wfhCount = at.filter((a) => a.status === 'wfh').length
    const touchedClients = Array.from(new Set(tc.map((t) => t.clients?.company_name).filter(Boolean)))
    const leaveDays = lv.reduce((s, l) => s + Number(l.days || 0), 0)

    const brief =
      `*Performance brief — ${empAny.full_name}*\n` +
      `Window: last ${days} days (${since} → ${today})\n\n` +
      `*Tasks closed:* ${tc.length}\n` +
      (tc.slice(0, 5).map((t) => `  • ${t.title}${t.clients?.company_name ? ` — ${t.clients.company_name}` : ''}`).join('\n') || '  (none)') + '\n\n' +
      `*Tasks still open:* ${to.length}\n` +
      (to.slice(0, 5).map((t) => `  • ${(t.priority || '').toUpperCase()} · ${t.title} (due ${t.due_date || '—'})`).join('\n') || '  (none)') + '\n\n' +
      `*Clients touched:* ${touchedClients.length ? touchedClients.join(', ') : '—'}\n` +
      `*Weekly reports authored:* ${reports.length}\n` +
      `*Content posted:* ${content.length}\n` +
      `*Leave taken:* ${leaveDays} day(s) across ${lv.length} request(s)\n` +
      `*Attendance:* ${lateCount} late days (${lateMinutes} min total), ${wfhCount} WFH days\n\n` +
      `Suggested 1:1 talking points:\n` +
      `  • Review the ${to.length} open tasks — any blocked?\n` +
      `  • Acknowledge wins from the ${tc.length} closed tasks${touchedClients[0] ? ` (esp. ${touchedClients[0]} work)` : ''}\n` +
      `  • ${lateCount >= 3 ? '⚠ Discuss the lateness pattern (' + lateCount + ' late days)' : 'Check in on workload balance'}\n` +
      `  • Career growth: what does the next 90 days look like?`

    return {
      ok: true,
      brief,
      metrics: {
        tasks_closed: tc.length, tasks_open: to.length, clients_touched: touchedClients,
        reports: reports.length, content: content.length, leave_days: leaveDays,
        late_count: lateCount, late_minutes: lateMinutes, wfh_count: wfhCount,
      },
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// =============================================================================
// F12: HR documents — record an upload from the dashboard
// =============================================================================

export async function recordHrDocument(input: {
  employee_id: string
  doc_type: string
  file_path: string
  file_url?: string
  doc_number?: string
  issue_date?: string
  expiry_date?: string
  notes?: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
    const { data, error } = await sb().from('hr_documents').insert({
      employee_id: input.employee_id,
      doc_type: input.doc_type,
      file_path: input.file_path,
      file_url: input.file_url || input.file_path,
      doc_number: input.doc_number ?? null,
      issue_date: input.issue_date ?? null,
      expiry_date: input.expiry_date ?? null,
      notes: input.notes ?? null,
    } as any).select('id').single()
    if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' }

    if (input.expiry_date && ['iqama', 'passport', 'visa'].includes(input.doc_type)) {
      await sb().from('team_members').update({
        [`${input.doc_type}_expiry`]: input.expiry_date,
        ...(input.doc_number && input.doc_type === 'iqama' ? { iqama_number: input.doc_number } : {}),
      } as any).eq('id', input.employee_id)
    }
    revalidatePath('/hr/documents')
    revalidatePath('/hr/expiries')
    return { ok: true, id: (data as any).id }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}
