import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Users, Calendar, Banknote, AlertCircle, Briefcase, ClipboardCheck } from 'lucide-react'
import { LeaveRequestActions } from './LeaveRequestActions'
import { PayrollActions } from './PayrollActions'
import { GeneratePayrollButton } from './GeneratePayrollButton'
import { RequestLeaveButton } from './RequestLeaveButton'

export const revalidate = 30

const T = {
  en: {
    pageTitle: 'Human Resources',
    pageSub: 'Headcount, leave management, and monthly payroll runs — your team\'s operations layer.',
    headcount: 'Headcount',
    activeStaff: 'Active staff',
    monthlyPayroll: 'Monthly Payroll',
    grossThisMonth: 'Gross this month',
    onLeaveToday: 'On Leave Today',
    pendingLeave: 'Pending Approvals',
    awaitingDecision: 'Awaiting your decision',
    employees: 'Employees',
    fullDirectory: 'Open the Team directory →',
    leaveSection: 'Leave Requests',
    leaveSubtitle: 'Pending requests need approval. Approved requests deduct from each employee\'s annual leave balance.',
    requestLeave: 'Request Leave',
    payrollSection: 'Payroll',
    payrollSubtitle: 'Generate payroll for the current month, then mark each row paid as you process payments.',
    generatePayroll: 'Generate this month',
    period: 'Period',
    empCol: 'Employee',
    typeCol: 'Type',
    datesCol: 'Dates',
    daysCol: 'Days',
    statusCol: 'Status',
    reasonCol: 'Reason',
    actionsCol: 'Actions',
    grossCol: 'Gross',
    bonusCol: 'Bonus',
    deductionsCol: 'Deductions',
    netCol: 'Net',
    paidCol: 'Paid',
    noLeave: 'No leave requests yet.',
    noPayroll: 'No payroll rows for this month yet — click "Generate this month" to seed one row per active employee.',
    leaveTypeAnnual: 'Annual',
    leaveTypeSick: 'Sick',
    leaveTypeUnpaid: 'Unpaid',
    leaveTypePersonal: 'Personal',
    leaveTypeMaternity: 'Maternity',
    leaveTypePaternity: 'Paternity',
    leaveTypeBereavement: 'Bereavement',
    leaveTypeHajj: 'Hajj',
    leaveTypeOther: 'Other',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    paid: 'Paid',
    notPaid: 'Not paid',
    balance: 'Balance',
    days: 'days',
    noEmpsForLeave: 'You need at least one employee in the Team page to request leave or run payroll.',
  },
  ar: {
    pageTitle: 'الموارد البشرية',
    pageSub: 'الموظفون وإدارة الإجازات وكشف الرواتب الشهري — طبقة عمليات فريقك.',
    headcount: 'إجمالي الموظفين',
    activeStaff: 'موظفون نشطون',
    monthlyPayroll: 'الراتب الشهري',
    grossThisMonth: 'الإجمالي هذا الشهر',
    onLeaveToday: 'في إجازة اليوم',
    pendingLeave: 'بانتظار الموافقة',
    awaitingDecision: 'بانتظار قرارك',
    employees: 'الموظفون',
    fullDirectory: 'فتح دليل الفريق ←',
    leaveSection: 'طلبات الإجازات',
    leaveSubtitle: 'الطلبات المعلقة تحتاج موافقة. الإجازات المعتمدة تُخصم من رصيد الإجازة السنوية للموظف.',
    requestLeave: 'تقديم طلب إجازة',
    payrollSection: 'كشف الرواتب',
    payrollSubtitle: 'أنشئ كشف رواتب الشهر الحالي، ثم اعتمد كل صف عند صرف الراتب.',
    generatePayroll: 'إنشاء كشف هذا الشهر',
    period: 'الفترة',
    empCol: 'الموظف',
    typeCol: 'النوع',
    datesCol: 'التواريخ',
    daysCol: 'الأيام',
    statusCol: 'الحالة',
    reasonCol: 'السبب',
    actionsCol: 'إجراءات',
    grossCol: 'الإجمالي',
    bonusCol: 'مكافأة',
    deductionsCol: 'استقطاعات',
    netCol: 'الصافي',
    paidCol: 'الدفع',
    noLeave: 'لا توجد طلبات إجازة.',
    noPayroll: 'لا يوجد كشف رواتب لهذا الشهر — اضغط "إنشاء كشف هذا الشهر" لإنشاء صف لكل موظف نشط.',
    leaveTypeAnnual: 'سنوية',
    leaveTypeSick: 'مرضية',
    leaveTypeUnpaid: 'بدون راتب',
    leaveTypePersonal: 'شخصية',
    leaveTypeMaternity: 'أمومة',
    leaveTypePaternity: 'أبوة',
    leaveTypeBereavement: 'حداد',
    leaveTypeHajj: 'حج',
    leaveTypeOther: 'أخرى',
    pending: 'معلقة',
    approved: 'معتمدة',
    rejected: 'مرفوضة',
    cancelled: 'ملغاة',
    paid: 'مدفوع',
    notPaid: 'لم يُدفع',
    balance: 'الرصيد',
    days: 'يوم',
    noEmpsForLeave: 'تحتاج إلى موظف واحد على الأقل في صفحة الفريق لتقديم إجازة أو تشغيل كشف الرواتب.',
  },
} as const

function fmtMoney(n: number, currency: string) {
  return `${Math.round(n).toLocaleString('en-US')} ${currency}`
}

export default async function HRPage() {
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const isRtl = locale === 'ar'

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const today = now.toISOString().slice(0, 10)

  const [
    { data: employees },
    { data: leaveRequests },
    { data: payrollRows },
  ] = await Promise.all([
    (supabaseClient as any)
      .from('team_members')
      .select('id, full_name, role, job_title, status, salary, salary_currency, department, employment_type, annual_leave_balance, hire_date, iqama_expiry')
      .order('full_name'),
    (supabaseClient as any)
      .from('leave_requests')
      .select('id, employee_id, type, start_date, end_date, days, status, reason, decision_note, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    (supabaseClient as any)
      .from('payroll_records')
      .select('id, employee_id, period_year, period_month, gross_amount, deductions, bonus, net_amount, currency, status, paid_date, method, notes')
      .eq('period_year', year)
      .eq('period_month', month),
  ])

  const emps = (employees as any[]) ?? []
  const empById = new Map<string, any>(emps.map((e) => [e.id, e]))
  const empClients = emps.map((e) => ({ id: e.id, full_name: e.full_name, annual_leave_balance: e.annual_leave_balance ?? 21 }))
  const activeEmps = emps.filter((e) => e.status === 'active')

  const lr = (leaveRequests as any[]) ?? []
  const pendingLeave = lr.filter((r) => r.status === 'pending')
  const onLeaveToday = lr.filter((r) => r.status === 'approved' && r.start_date <= today && r.end_date >= today)

  const payroll = (payrollRows as any[]) ?? []
  const monthlyGross = activeEmps.reduce((s, e) => s + Number(e.salary ?? 0), 0)
  const defaultCurrency = activeEmps.find((e) => e.salary)?.salary_currency || 'SAR'

  const leaveTypeLabel: Record<string, string> = {
    annual: t.leaveTypeAnnual,
    sick: t.leaveTypeSick,
    unpaid: t.leaveTypeUnpaid,
    personal: t.leaveTypePersonal,
    maternity: t.leaveTypeMaternity,
    paternity: t.leaveTypePaternity,
    bereavement: t.leaveTypeBereavement,
    hajj: t.leaveTypeHajj,
    other: t.leaveTypeOther,
  }
  const leaveStatusLabel: Record<string, { label: string; cls: string }> = {
    pending:   { label: t.pending,   cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
    approved:  { label: t.approved,  cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
    rejected:  { label: t.rejected,  cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    cancelled: { label: t.cancelled, cls: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
  }

  const monthLabel = now.toLocaleDateString(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6 pb-10" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Briefcase className="h-7 w-7 text-indigo-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-2xl">{t.pageSub}</p>
        </div>
        <Link href="/team" className="btn btn-secondary text-sm">{t.fullDirectory}</Link>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t.headcount,      value: activeEmps.length,                              sub: t.activeStaff,        color: 'border-l-indigo-500', icon: Users },
          { label: t.monthlyPayroll, value: fmtMoney(monthlyGross, defaultCurrency),        sub: t.grossThisMonth,     color: 'border-l-emerald-500', icon: Banknote },
          { label: t.onLeaveToday,   value: onLeaveToday.length,                            sub: today,                color: 'border-l-amber-500',   icon: Calendar },
          { label: t.pendingLeave,   value: pendingLeave.length,                            sub: t.awaitingDecision,   color: 'border-l-red-500',     icon: AlertCircle },
        ].map((kpi, i) => (
          <div key={i} className={`premium-card p-4 border-l-4 ${kpi.color} flex items-center gap-4`}>
            <kpi.icon className="h-8 w-8 text-[hsl(var(--muted-foreground))] opacity-40 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-2xl font-black">{kpi.value}</p>
              <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{kpi.label}</p>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))/0.7] truncate">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* LEAVE REQUESTS */}
      <section className="premium-card overflow-hidden">
        <div className="p-5 border-b border-[hsl(var(--border))] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-indigo-500" /> {t.leaveSection}
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 max-w-2xl">{t.leaveSubtitle}</p>
          </div>
          <RequestLeaveButton
            employees={empClients}
            label={t.requestLeave}
            noEmpsHint={t.noEmpsForLeave}
            isRtl={isRtl}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.empCol}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.typeCol}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.datesCol}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.daysCol}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.statusCol}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.reasonCol}</th>
                <th className={isRtl ? 'text-left' : 'text-right'}>{t.actionsCol}</th>
              </tr>
            </thead>
            <tbody>
              {lr.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))] italic">{t.noLeave}</td>
                </tr>
              )}
              {lr.map((r) => {
                const emp = empById.get(r.employee_id)
                const cfg = leaveStatusLabel[r.status] ?? leaveStatusLabel.pending
                return (
                  <tr key={r.id}>
                    <td>
                      <p className="font-semibold text-sm">{emp?.full_name ?? '—'}</p>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{t.balance}: {emp?.annual_leave_balance ?? '—'} {t.days}</p>
                    </td>
                    <td><span className="badge text-[10px] badge-secondary">{leaveTypeLabel[r.type] || r.type}</span></td>
                    <td className="text-xs">{r.start_date} → {r.end_date}</td>
                    <td className="font-bold">{r.days}</td>
                    <td><span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span></td>
                    <td className="text-xs text-[hsl(var(--muted-foreground))] max-w-[220px] truncate">{r.reason || '—'}</td>
                    <td className={isRtl ? 'text-left' : 'text-right'}>
                      <LeaveRequestActions
                        id={r.id}
                        status={r.status}
                        canApprove={r.status === 'pending'}
                        approveLabel={t.approved}
                        rejectLabel={t.rejected}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* PAYROLL */}
      <section className="premium-card overflow-hidden">
        <div className="p-5 border-b border-[hsl(var(--border))] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-500" /> {t.payrollSection}
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 max-w-2xl">{t.payrollSubtitle}</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">{t.period}: <strong>{monthLabel}</strong></p>
          </div>
          <GeneratePayrollButton year={year} month={month} label={t.generatePayroll} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.empCol}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.grossCol}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.bonusCol}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.deductionsCol}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.netCol}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.statusCol}</th>
                <th className={isRtl ? 'text-left' : 'text-right'}>{t.actionsCol}</th>
              </tr>
            </thead>
            <tbody>
              {payroll.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))] italic max-w-md mx-auto">{t.noPayroll}</td></tr>
              )}
              {payroll.map((p) => {
                const emp = empById.get(p.employee_id)
                return (
                  <tr key={p.id}>
                    <td>
                      <p className="font-semibold text-sm">{emp?.full_name ?? '—'}</p>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{emp?.job_title || emp?.role || '—'}</p>
                    </td>
                    <td className="font-bold">{fmtMoney(Number(p.gross_amount), p.currency)}</td>
                    <td className={Number(p.bonus) > 0 ? 'text-emerald-600 font-semibold' : 'text-[hsl(var(--muted-foreground))]'}>{fmtMoney(Number(p.bonus), p.currency)}</td>
                    <td className={Number(p.deductions) > 0 ? 'text-red-600 font-semibold' : 'text-[hsl(var(--muted-foreground))]'}>{fmtMoney(Number(p.deductions), p.currency)}</td>
                    <td className="font-black text-emerald-700 dark:text-emerald-400">{fmtMoney(Number(p.net_amount), p.currency)}</td>
                    <td>
                      <span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : p.status === 'cancelled' ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                        {p.status === 'paid' ? `${t.paid} · ${p.paid_date}` : t.notPaid}
                      </span>
                    </td>
                    <td className={isRtl ? 'text-left' : 'text-right'}>
                      <PayrollActions id={p.id} status={p.status} paidLabel={t.paid} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
