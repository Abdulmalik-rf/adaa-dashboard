import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { AlertTriangle, Calendar, ShieldAlert, FileBadge, Plane } from 'lucide-react'

export const revalidate = 60

// Single-page view of everything that's about to expire for the team:
// iqama / passport / visa from team_members + anything in hr_documents
// with expiry_date set. Sorted by soonest-first. Colour-coded by urgency.

const T = {
  en: {
    pageTitle: 'Document Expiries',
    pageSub: 'Iqamas, passports, visas, and any HR document with an expiry date. The WhatsApp watchdog fires automatically at 90 / 60 / 30 / 14 / 7 / 1 days out.',
    backLink: '← Back to HR',
    critical: 'Critical (<7d)',
    urgent: 'Urgent (7-30d)',
    upcoming: 'Upcoming (30-90d)',
    expired: 'Expired',
    none: 'No documents are tracked yet. Open an employee record and set their iqama / passport / visa expiry dates, or upload a scan to /hr/documents.',
    colKind: 'Document',
    colEmployee: 'Employee',
    colExpiry: 'Expires',
    colDaysLeft: 'Days left',
    colNumber: 'Number',
    daysAgo: 'days ago',
    today: 'today',
    days: 'days',
    expiredLabel: 'EXPIRED',
  },
  ar: {
    pageTitle: 'انتهاء صلاحية الوثائق',
    pageSub: 'الإقامات وجوازات السفر والتأشيرات وأي وثيقة موارد بشرية لها تاريخ انتهاء. يطلق نظام المراقبة في واتساب تذكيرات تلقائياً عند 90 / 60 / 30 / 14 / 7 / 1 يوماً قبل الانتهاء.',
    backLink: '← العودة إلى الموارد البشرية',
    critical: 'حرجة (<7 أيام)',
    urgent: 'عاجلة (7-30 يوم)',
    upcoming: 'قادمة (30-90 يوم)',
    expired: 'منتهية',
    none: 'لا توجد وثائق مُتتبَّعة بعد. افتح ملف موظف وأضف تواريخ انتهاء الإقامة / الجواز / التأشيرة، أو ارفع نسخة في /hr/documents.',
    colKind: 'الوثيقة',
    colEmployee: 'الموظف',
    colExpiry: 'تاريخ الانتهاء',
    colDaysLeft: 'أيام متبقية',
    colNumber: 'الرقم',
    daysAgo: 'أيام مضت',
    today: 'اليوم',
    days: 'يوم',
    expiredLabel: 'منتهية',
  },
} as const

type Row = {
  kind: string
  employee_id: string
  employee_name: string
  expiry_date: string
  number?: string | null
  days_left: number
  source: 'team_members' | 'hr_documents'
  source_id: string
}

function daysBetween(today: string, expiry: string): number {
  const a = Date.parse(today + 'T00:00:00Z')
  const b = Date.parse(expiry + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86400000)
}

function urgencyClass(days: number): string {
  if (days < 0) return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-l-gray-500'
  if (days < 7)  return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-l-red-500'
  if (days < 30) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-l-amber-500'
  return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-l-blue-500'
}

function kindIcon(kind: string) {
  if (kind === 'iqama' || kind.startsWith('document:iqama')) return ShieldAlert
  if (kind === 'passport' || kind.startsWith('document:passport')) return Plane
  if (kind === 'visa' || kind.startsWith('document:visa')) return Plane
  return FileBadge
}

export default async function ExpiriesPage() {
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const ar = locale === 'ar'
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: emps }, { data: docs }] = await Promise.all([
    (supabaseClient as any).from('team_members')
      .select('id, full_name, iqama_expiry, passport_expiry, visa_expiry, iqama_number, status')
      .eq('status', 'active'),
    (supabaseClient as any).from('hr_documents')
      .select('id, employee_id, doc_type, doc_number, expiry_date, team_members:employee_id (full_name)')
      .not('expiry_date', 'is', null),
  ])

  const rows: Row[] = []
  for (const e of (emps as any[]) ?? []) {
    if (e.iqama_expiry)    rows.push({ kind: 'iqama',    employee_id: e.id, employee_name: e.full_name, expiry_date: e.iqama_expiry,    number: e.iqama_number ?? null, days_left: daysBetween(today, e.iqama_expiry),    source: 'team_members', source_id: e.id })
    if (e.passport_expiry) rows.push({ kind: 'passport', employee_id: e.id, employee_name: e.full_name, expiry_date: e.passport_expiry, number: null,                   days_left: daysBetween(today, e.passport_expiry), source: 'team_members', source_id: e.id })
    if (e.visa_expiry)     rows.push({ kind: 'visa',     employee_id: e.id, employee_name: e.full_name, expiry_date: e.visa_expiry,     number: null,                   days_left: daysBetween(today, e.visa_expiry),     source: 'team_members', source_id: e.id })
  }
  for (const d of (docs as any[]) ?? []) {
    rows.push({
      kind: `document:${d.doc_type}`,
      employee_id: d.employee_id,
      employee_name: d.team_members?.full_name ?? '—',
      expiry_date: d.expiry_date,
      number: d.doc_number,
      days_left: daysBetween(today, d.expiry_date),
      source: 'hr_documents',
      source_id: d.id,
    })
  }
  rows.sort((a, b) => a.days_left - b.days_left)

  const critical = rows.filter((r) => r.days_left >= 0 && r.days_left < 7)
  const urgent   = rows.filter((r) => r.days_left >= 7 && r.days_left < 30)
  const upcoming = rows.filter((r) => r.days_left >= 30 && r.days_left < 90)
  const expired  = rows.filter((r) => r.days_left < 0)

  return (
    <div className="space-y-6 pb-10" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <AlertTriangle className="h-7 w-7 text-amber-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/hr" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
          {t.backLink}
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="premium-card p-4 border-l-4 border-l-red-500">
          <p className="text-2xl font-black">{critical.length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.critical}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-amber-500">
          <p className="text-2xl font-black">{urgent.length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.urgent}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-blue-500">
          <p className="text-2xl font-black">{upcoming.length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.upcoming}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-gray-500">
          <p className="text-2xl font-black">{expired.length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.expired}</p>
        </div>
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
              <tr>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colKind}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colEmployee}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colExpiry}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colDaysLeft}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colNumber}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-12 text-center text-xs text-[hsl(var(--muted-foreground))] italic max-w-md">{t.none}</td></tr>
              )}
              {rows.map((r, i) => {
                const Icon = kindIcon(r.kind)
                const cls = urgencyClass(r.days_left)
                const kindLabel = r.kind.startsWith('document:') ? r.kind.slice('document:'.length).replace(/_/g, ' ') : r.kind
                const expiredHere = r.days_left < 0
                return (
                  <tr key={i} className={`border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.3)] transition-colors border-l-4 ${cls.split(' ').filter(s => s.startsWith('border-l-')).join(' ')}`}>
                    <td className="px-3 py-2">
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                        <Icon className="h-3.5 w-3.5" /> {kindLabel}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold">{r.employee_name}</td>
                    <td className="px-3 py-2 text-xs">{r.expiry_date}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${cls}`}>
                        {expiredHere
                          ? `${t.expiredLabel} ${Math.abs(r.days_left)} ${t.daysAgo}`
                          : r.days_left === 0
                            ? t.today
                            : `${r.days_left} ${t.days}`}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-[hsl(var(--muted-foreground))]">{r.number || '—'}</td>
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
