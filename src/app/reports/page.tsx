import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase/client'
import { FileBarChart2, ArrowUpRight, Calendar, Plus, Trash2 } from 'lucide-react'
import { deleteReport } from '@/app/actions/reports'
import { createReport } from '@/app/actions/reports'

export const revalidate = 30

const T = {
  en: {
    title: 'Weekly Reports',
    total: 'total',
    drafts: 'drafts',
    sent: 'sent',
    archived: 'archived',
    newReport: 'New Report',
    totalReports: 'Total Reports',
    draftsLbl: 'Drafts',
    sentLbl: 'Sent',
    archivedLbl: 'Archived',
    all: 'All',
    draftFilter: 'Draft',
    sentFilter: 'Sent',
    archivedFilter: 'Archived',
    colReport: 'Report #',
    colClient: 'Client',
    colPeriod: 'Period',
    colIssued: 'Issued',
    colSections: 'Sections',
    colStatus: 'Status',
    colActions: 'Actions',
    emptyTitle: 'No weekly reports',
    emptyIn: (s: string) => `No weekly reports in "${s}"`,
    emptyHint: 'Hit',
    emptyHint2: 'above, or ask the agent: "create a weekly report for TechNova".',
    service: 'service',
    services: 'services',
    legacy: 'legacy',
    empty: 'empty',
    open: 'Open',
    deleteReport: 'Delete report',
  },
  ar: {
    title: 'التقارير الأسبوعية',
    total: 'إجمالي',
    drafts: 'مسودات',
    sent: 'مُرسلة',
    archived: 'مؤرشفة',
    newReport: 'تقرير جديد',
    totalReports: 'إجمالي التقارير',
    draftsLbl: 'مسودات',
    sentLbl: 'مُرسلة',
    archivedLbl: 'مؤرشفة',
    all: 'الكل',
    draftFilter: 'مسودة',
    sentFilter: 'مُرسلة',
    archivedFilter: 'مؤرشفة',
    colReport: '# التقرير',
    colClient: 'العميل',
    colPeriod: 'الفترة',
    colIssued: 'تاريخ الإصدار',
    colSections: 'الأقسام',
    colStatus: 'الحالة',
    colActions: 'إجراءات',
    emptyTitle: 'لا توجد تقارير أسبوعية',
    emptyIn: (s: string) => `لا توجد تقارير في "${s}"`,
    emptyHint: 'اضغط',
    emptyHint2: 'بالأعلى، أو اطلب من الوكيل: "أنشئ تقريراً أسبوعياً لعميل ما".',
    service: 'خدمة',
    services: 'خدمات',
    legacy: 'قديم',
    empty: 'فارغ',
    open: 'فتح',
    deleteReport: 'حذف التقرير',
  },
} as const

function fmtDate(val: string | null, locale: 'en' | 'ar' = 'en') {
  if (!val) return '—'
  const d = new Date(val + 'T00:00:00')
  return d.toLocaleDateString(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtRange(start: string | null, end: string | null, locale: 'en' | 'ar' = 'en') {
  if (!start && !end) return '—'
  if (!end) return fmtDate(start, locale)
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${start} – ${end}`
  const sameYear = s.getFullYear() === e.getFullYear()
  const tag = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US'
  const sFmt = s.toLocaleDateString(tag, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
  const eFmt = e.toLocaleDateString(tag, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${sFmt} – ${eFmt}`
}

const statusStyle: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300',
  sent: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  archived: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const isRtl = locale === 'ar'

  const { data: reports } = await (supabaseClient as any)
    .from('weekly_reports')
    .select(
      'id, report_number, client_id, client_name_snapshot, customer_name, customer_company, period_start, period_end, issue_date, status, services, kpis, platforms, content_items, campaigns, tasks_done, tasks_plan, created_at',
    )
    .order('created_at', { ascending: false })

  const all = reports ?? []
  const filtered = status && status !== 'all' ? all.filter((r: any) => r.status === status) : all

  const total = all.length
  const draftCount = all.filter((r: any) => r.status === 'draft').length
  const sentCount = all.filter((r: any) => r.status === 'sent').length
  const archivedCount = all.filter((r: any) => r.status === 'archived').length

  const statuses: { key: string; label: string }[] = [
    { key: 'all', label: t.all },
    { key: 'draft', label: t.draftFilter },
    { key: 'sent', label: t.sentFilter },
    { key: 'archived', label: t.archivedFilter },
  ]

  return (
    <div className="space-y-6 pb-10" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <FileBarChart2 className="h-7 w-7 text-[hsl(var(--primary))]" /> {t.title}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium">
            {total} {t.total} · {draftCount} {t.drafts} · {sentCount} {t.sent} · {archivedCount} {t.archived}
          </p>
        </div>
        <form
          action={async () => {
            'use server'
            const fd = new FormData()
            const r = await createReport(fd)
            redirect(`/reports/${r.id}/edit`)
          }}
        >
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-bold flex items-center gap-2 shadow-md shadow-[hsl(var(--primary)/0.2)]"
          >
            <Plus className="h-4 w-4" /> {t.newReport}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="premium-card p-4 border-l-4 border-l-blue-500">
          <p className="text-2xl font-black">{total}</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            {t.totalReports}
          </p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-gray-400">
          <p className="text-2xl font-black">{draftCount}</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            {t.draftsLbl}
          </p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-amber-500">
          <p className="text-2xl font-black">{sentCount}</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            {t.sentLbl}
          </p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-indigo-500">
          <p className="text-2xl font-black">{archivedCount}</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            {t.archivedLbl}
          </p>
        </div>
      </div>

      <div className="premium-card p-4 flex gap-1.5 flex-wrap">
        {statuses.map((s) => (
          <Link key={s.key} href={`/reports?status=${s.key}`}>
            <button
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                status === s.key || (!status && s.key === 'all')
                  ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))] shadow-sm'
                  : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'
              }`}
            >
              {s.label}
            </button>
          </Link>
        ))}
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colReport}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colClient}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colPeriod}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colIssued}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colSections}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colStatus}</th>
                <th className={isRtl ? 'text-left' : 'text-right'}>{t.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <FileBarChart2 className="h-12 w-12 mx-auto mb-3 opacity-15" />
                    <p className="text-[hsl(var(--muted-foreground))] font-medium">
                      {status && status !== 'all' ? t.emptyIn(status) : t.emptyTitle}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
                      {t.emptyHint} <strong>{t.newReport}</strong> {t.emptyHint2}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map((r: any) => {
                const services = Array.isArray(r.services) ? r.services.length : 0
                // Legacy section counts (only shown when the report has no
                // service blocks yet — gives the user a hint to migrate).
                const legacyTotal =
                  (r.kpis ?? []).length +
                  (r.platforms ?? []).length +
                  (r.content_items ?? []).length +
                  (r.campaigns ?? []).length +
                  (r.tasks_done ?? []).length +
                  (r.tasks_plan ?? []).length
                const customer = r.customer_name || r.client_name_snapshot || '—'
                return (
                  <tr
                    key={r.id}
                    className="group cursor-pointer hover:bg-[hsl(var(--muted)/0.3)] transition-colors"
                  >
                    <td>
                      <Link href={`/reports/${r.id}`}>
                        <span className="font-bold text-[hsl(var(--primary))]">{r.report_number}</span>
                      </Link>
                    </td>
                    <td>
                      <p className="font-semibold text-sm">{customer}</p>
                      {r.customer_company && (
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{r.customer_company}</p>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                        <Calendar className="h-3 w-3" />
                        {fmtRange(r.period_start, r.period_end, locale)}
                      </div>
                    </td>
                    <td>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {fmtDate(r.issue_date, locale)}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                        {services > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                            {services} {services === 1 ? t.service : t.services}
                          </span>
                        )}
                        {services === 0 && legacyTotal > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                            {t.legacy} ({legacyTotal})
                          </span>
                        )}
                        {services === 0 && legacyTotal === 0 && (
                          <span className="text-[hsl(var(--muted-foreground))] italic">{t.empty}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                          statusStyle[r.status] ?? statusStyle.draft
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className={isRtl ? 'text-left' : 'text-right'}>
                      <div className={`flex items-center gap-1.5 ${isRtl ? 'justify-start' : 'justify-end'}`}>
                        <Link href={`/reports/${r.id}`}>
                          <button
                            className="h-8 w-8 rounded-lg border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))] transition-all"
                            title={t.open}
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                        </Link>
                        <form action={deleteReport.bind(null, r.id)}>
                          <button
                            type="submit"
                            className="h-8 w-8 rounded-lg bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                            title={t.deleteReport}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
