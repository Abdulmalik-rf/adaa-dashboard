import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react'

export const revalidate = 30

const T = {
  en: {
    pageTitle: 'Attendance',
    pageSub: "Monthly check-in / WFH / late report. Employees DM the WhatsApp bot 'in', 'out', 'WFH', or 'late 30min' — each message becomes a row here. Use the report before payroll to spot unpaid-leave days.",
    backLink: '← Back to HR',
    colEmployee: 'Employee', colPresent: 'Present', colWfh: 'WFH', colLate: 'Late', colLateMin: 'Late min', colAbsent: 'Absent',
    none: 'No attendance logs for this month yet.',
  },
  ar: {
    pageTitle: 'الحضور والانصراف',
    pageSub: 'تقرير شهري لتسجيلات الحضور والعمل عن بُعد والتأخير. الموظفون يراسلون البوت بـ "in" أو "WFH" أو "تأخير 30 دقيقة" — وتظهر النتائج هنا.',
    backLink: '← العودة',
    colEmployee: 'الموظف', colPresent: 'حاضر', colWfh: 'عن بُعد', colLate: 'متأخر', colLateMin: 'دقائق التأخير', colAbsent: 'غائب',
    none: 'لا توجد سجلات حضور لهذا الشهر بعد.',
  },
} as const

function fmtMonth(y: number, m: number, locale: string): string {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const sp = await searchParams
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const ar = locale === 'ar'
  const now = new Date()
  const year = parseInt(sp.year || '', 10) || now.getUTCFullYear()
  const month = parseInt(sp.month || '', 10) || (now.getUTCMonth() + 1)

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: logs } = await (supabaseClient as any)
    .from('attendance_logs')
    .select('employee_id, log_date, status, late_minutes, team_members:employee_id (full_name)')
    .gte('log_date', from).lte('log_date', to)

  const per = new Map<string, { name: string; present: number; wfh: number; late: number; absent: number; late_minutes: number }>()
  for (const r of (logs as any[]) ?? []) {
    if (!per.has(r.employee_id)) per.set(r.employee_id, { name: r.team_members?.full_name ?? '—', present: 0, wfh: 0, late: 0, absent: 0, late_minutes: 0 })
    const m = per.get(r.employee_id)!
    if (r.status === 'present') m.present++
    else if (r.status === 'wfh') m.wfh++
    else if (r.status === 'late') { m.late++; m.late_minutes += Number(r.late_minutes || 0) }
    else if (r.status === 'absent') m.absent++
  }
  const rows = Array.from(per.values()).sort((a, b) => a.name.localeCompare(b.name))

  const prevM = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
  const nextM = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }

  return (
    <div className="space-y-6 pb-10" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Clock className="h-7 w-7 text-emerald-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/hr" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">{t.backLink}</Link>
      </div>

      <div className="premium-card p-4 flex items-center gap-3 justify-center">
        <Link href={`/hr/attendance?year=${prevM.y}&month=${prevM.m}`} className="btn btn-ghost btn-icon"><ChevronLeft className="h-4 w-4" /></Link>
        <span className="font-bold text-lg">{fmtMonth(year, month, locale)}</span>
        <Link href={`/hr/attendance?year=${nextM.y}&month=${nextM.m}`} className="btn btn-ghost btn-icon"><ChevronRight className="h-4 w-4" /></Link>
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
              <tr>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colEmployee}</th>
                <th className="px-3 py-2 text-right">{t.colPresent}</th>
                <th className="px-3 py-2 text-right">{t.colWfh}</th>
                <th className="px-3 py-2 text-right">{t.colLate}</th>
                <th className="px-3 py-2 text-right">{t.colLateMin}</th>
                <th className="px-3 py-2 text-right">{t.colAbsent}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-12 text-center text-xs italic text-[hsl(var(--muted-foreground))]">{t.none}</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-[hsl(var(--border))]">
                  <td className="px-3 py-2 font-semibold">{r.name}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.present}</td>
                  <td className="px-3 py-2 text-right text-purple-700 dark:text-purple-400 font-semibold">{r.wfh}</td>
                  <td className={`px-3 py-2 text-right font-bold ${r.late >= 3 ? 'text-red-600' : r.late > 0 ? 'text-amber-600' : ''}`}>{r.late}</td>
                  <td className="px-3 py-2 text-right text-xs text-[hsl(var(--muted-foreground))]">{r.late_minutes}</td>
                  <td className={`px-3 py-2 text-right font-bold ${r.absent > 0 ? 'text-red-600' : ''}`}>{r.absent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
