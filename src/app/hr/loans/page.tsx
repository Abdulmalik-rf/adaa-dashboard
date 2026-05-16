import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Coins, AlertOctagon } from 'lucide-react'
import { LoanRow } from './LoanRow'

export const revalidate = 30

const T = {
  en: {
    pageTitle: 'Loans & Salary Advances',
    pageSub: 'Employees submit loan/advance requests via the WhatsApp agent ("I need 10,000 SAR over 6 months"). Each becomes a row here for you to approve or reject. Approved loans auto-deduct the monthly amount from the next payroll cycles. KSA Labour Law Article 92: max 50% of net pay can be deducted in any single month.',
    backLink: '← Back to HR',
    submitted: 'Pending', approved: 'Approved', rejected: 'Rejected', repaying: 'Repaying', repaid: 'Repaid', cancelled: 'Cancelled', draft: 'Draft',
    filterAll: 'All',
    colEmployee: 'Employee', colAmount: 'Amount', colTerm: 'Term', colMonthly: 'Monthly', colFirstDed: 'Starts', colReason: 'Reason', colStatus: 'Status', colActions: 'Actions',
    none: 'No loan requests yet. Employees can DM the WhatsApp bot: "I need a 5000 loan over 4 months for medical".',
  },
  ar: {
    pageTitle: 'القروض والسلف',
    pageSub: 'الموظفون يقدمون طلبات قروض / سلف عبر وكيل واتساب ("أبغى 10000 ريال على 6 أشهر"). يظهر كل طلب هنا لاعتماده أو رفضه. القروض المعتمدة تُخصم شهرياً من الرواتب القادمة تلقائياً. المادة 92 من نظام العمل: لا يتجاوز إجمالي الخصم 50% من صافي الراتب في أي شهر.',
    backLink: '← العودة',
    submitted: 'بانتظار المراجعة', approved: 'معتمدة', rejected: 'مرفوضة', repaying: 'قيد السداد', repaid: 'مسددة', cancelled: 'ملغاة', draft: 'مسودة',
    filterAll: 'الكل',
    colEmployee: 'الموظف', colAmount: 'المبلغ', colTerm: 'المدة', colMonthly: 'القسط الشهري', colFirstDed: 'يبدأ', colReason: 'السبب', colStatus: 'الحالة', colActions: 'إجراءات',
    none: 'لا توجد طلبات قروض. يمكن للموظفين مراسلة البوت "أبغى سلفة 5000 على 4 أشهر للعلاج".',
  },
} as const

const statusBadge: Record<string, string> = {
  draft:     'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  submitted: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  approved:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  rejected:  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  repaying:  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  repaid:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const ar = locale === 'ar'

  const { data: loans } = await (supabaseClient as any)
    .from('hr_loan_requests')
    .select(`
      id, amount, currency, reason, term_months, monthly_deduction,
      first_deduction_year, first_deduction_month, status, decision_note,
      amount_repaid, created_at,
      team_members:employee_id (id, full_name, full_name_ar, job_title, base_salary, salary_currency)
    `)
    .order('created_at', { ascending: false })

  const all = (loans as any[]) ?? []
  const rows = status && status !== 'all' ? all.filter((r) => r.status === status) : all

  const counts = {
    submitted: all.filter((r) => r.status === 'submitted').length,
    approved: all.filter((r) => r.status === 'approved' || r.status === 'repaying').length,
    rejected: all.filter((r) => r.status === 'rejected').length,
    repaid: all.filter((r) => r.status === 'repaid').length,
    outstanding: all.filter((r) => ['approved', 'repaying'].includes(r.status))
      .reduce((s, r) => s + (Number(r.amount) - Number(r.amount_repaid || 0)), 0),
  }

  const filters = ['all', 'submitted', 'approved', 'repaying', 'rejected', 'repaid', 'cancelled'] as const
  const statusLabelMap: Record<string, string> = {
    draft: t.draft, submitted: t.submitted, approved: t.approved, rejected: t.rejected,
    repaying: t.repaying, repaid: t.repaid, cancelled: t.cancelled,
  }

  return (
    <div className="space-y-6 pb-10" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Coins className="h-7 w-7 text-amber-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/hr" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">{t.backLink}</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="premium-card p-4 border-l-4 border-l-amber-500">
          <p className="text-2xl font-black">{counts.submitted}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.submitted}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-blue-500">
          <p className="text-2xl font-black">{counts.approved}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.approved}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-red-500">
          <p className="text-2xl font-black">{counts.rejected}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.rejected}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-emerald-500">
          <p className="text-2xl font-black">{counts.repaid}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.repaid}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-purple-500">
          <p className="text-2xl font-black">{counts.outstanding.toLocaleString('en-US')}<span className="text-sm"> SAR</span></p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{ar ? 'إجمالي المتبقي' : 'Outstanding'}</p>
        </div>
      </div>

      <div className="premium-card p-3 flex gap-1.5 flex-wrap">
        {filters.map((f) => {
          const active = (status || 'all') === f
          return (
            <Link key={f} href={f === 'all' ? '/hr/loans' : `/hr/loans?status=${f}`}>
              <button className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                active ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'
              }`}>{f === 'all' ? t.filterAll : (statusLabelMap[f] ?? f)}</button>
            </Link>
          )
        })}
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
              <tr>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colEmployee}</th>
                <th className="px-3 py-2 text-right">{t.colAmount}</th>
                <th className="px-3 py-2 text-right">{t.colTerm}</th>
                <th className="px-3 py-2 text-right">{t.colMonthly}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colFirstDed}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colReason}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colStatus}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-12 text-center text-xs italic text-[hsl(var(--muted-foreground))]">{t.none}</td></tr>
              )}
              {rows.map((r: any) => (
                <LoanRow
                  key={r.id}
                  loan={r}
                  ar={ar}
                  statusBadge={statusBadge}
                  statusLabel={statusLabelMap}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="premium-card p-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/15 border-l-4 border-l-amber-500">
        <AlertOctagon className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>{ar ? 'تنبيه قانوني: نظام العمل السعودي - المادة 92 — لا يجوز خصم أكثر من 50% من صافي الراتب في أي شهر. النظام يرفض الطلبات التي تتجاوز هذا الحد تلقائياً.' : 'Legal note: KSA Labour Law Article 92 — total monthly deductions can\'t exceed 50% of net pay. The system rejects requests breaching this cap.'}</p>
      </div>
    </div>
  )
}
