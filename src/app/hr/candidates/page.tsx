import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { UserPlus, ExternalLink } from 'lucide-react'
import { CandidateRow } from './CandidateRow'

export const revalidate = 30

const T = {
  en: {
    pageTitle: 'Candidates',
    pageSub: 'CV intake pipeline. Forward a CV PDF to the WhatsApp agent — it extracts the data into a candidate row here. From this page you can update status, rate them, then "Promote to employee" with one tap to auto-create the team_member + kick off onboarding.',
    backLink: '← Back to HR',
    new: 'New', reviewing: 'Reviewing', interviewing: 'Interviewing', offered: 'Offered', hired: 'Hired', rejected: 'Rejected', archived: 'Archived',
    filterAll: 'All',
    colName: 'Candidate', colTitle: 'Current title', colExp: 'Exp', colAsking: 'Asking', colStatus: 'Status', colRating: 'Rating', colAdded: 'Added', colCV: 'CV', colActions: 'Actions',
    none: 'No candidates yet. Forward a CV PDF to the WhatsApp agent or add one manually via the agent.',
  },
  ar: {
    pageTitle: 'المرشحون',
    pageSub: 'خط أنابيب استقبال السير الذاتية. أعد توجيه CV PDF إلى وكيل واتساب — يستخرج البيانات ويُضيف صفّاً هنا. يمكنك تحديث الحالة، تقييم المرشح، ثم "ترقية إلى موظف" بضغطة واحدة لإنشاء team_member وبدء التوظيف تلقائياً.',
    backLink: '← العودة',
    new: 'جديد', reviewing: 'قيد المراجعة', interviewing: 'مقابلة', offered: 'تم العرض', hired: 'تم التعيين', rejected: 'مرفوض', archived: 'مؤرشف',
    filterAll: 'الكل',
    colName: 'المرشح', colTitle: 'المسمى الحالي', colExp: 'الخبرة', colAsking: 'الراتب المطلوب', colStatus: 'الحالة', colRating: 'التقييم', colAdded: 'تاريخ الإضافة', colCV: 'السيرة الذاتية', colActions: 'إجراءات',
    none: 'لا يوجد مرشحون بعد. أعد توجيه CV PDF إلى وكيل واتساب.',
  },
} as const

const statusBadge: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  reviewing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  interviewing: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  offered: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  hired: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const ar = locale === 'ar'

  const { data: candidates } = await (supabaseClient as any)
    .from('candidates')
    .select('id, full_name, email, phone, current_title, current_city, years_experience, education, skills, languages, asking_salary, salary_currency, cv_url, status, rating, notes, nationality, created_at')
    .order('created_at', { ascending: false })

  const all = (candidates as any[]) ?? []
  const rows = status && status !== 'all' ? all.filter((c) => c.status === status) : all

  const counts: Record<string, number> = {}
  for (const c of all) counts[c.status] = (counts[c.status] || 0) + 1

  const filters = ['all', 'new', 'reviewing', 'interviewing', 'offered', 'hired', 'rejected', 'archived'] as const
  const statusLabel: Record<string, string> = {
    new: t.new, reviewing: t.reviewing, interviewing: t.interviewing, offered: t.offered, hired: t.hired, rejected: t.rejected, archived: t.archived,
  }

  return (
    <div className="space-y-6 pb-10" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <UserPlus className="h-7 w-7 text-blue-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/hr" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">{t.backLink}</Link>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
        {filters.slice(1).map((f) => (
          <div key={f} className="premium-card p-3 text-center">
            <p className="text-xl font-black">{counts[f] || 0}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{statusLabel[f]}</p>
          </div>
        ))}
      </div>

      <div className="premium-card p-3 flex gap-1.5 flex-wrap">
        {filters.map((f) => {
          const active = (status || 'all') === f
          return (
            <Link key={f} href={f === 'all' ? '/hr/candidates' : `/hr/candidates?status=${f}`}>
              <button className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                active ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]'
                       : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'
              }`}>{f === 'all' ? t.filterAll : statusLabel[f]}</button>
            </Link>
          )
        })}
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
              <tr>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colName}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colTitle}</th>
                <th className="px-3 py-2 text-right">{t.colExp}</th>
                <th className="px-3 py-2 text-right">{t.colAsking}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colStatus}</th>
                <th className="px-3 py-2 text-right">{t.colRating}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colCV}</th>
                <th className="px-3 py-2 text-right">{t.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-12 text-center text-xs italic text-[hsl(var(--muted-foreground))]">{t.none}</td></tr>
              )}
              {rows.map((r) => (
                <CandidateRow
                  key={r.id}
                  c={r}
                  ar={ar}
                  statusBadge={statusBadge}
                  statusLabel={statusLabel}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
