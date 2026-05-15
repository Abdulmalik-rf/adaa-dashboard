import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { FileText, Plus } from 'lucide-react'

export const revalidate = 30

const T = {
  en: {
    pageTitle: 'HR Letters',
    pageSub: 'KSA labour-law-aware warnings, terminations, salary certificates, NOCs, and experience letters. Drafts arrive here from the WhatsApp agent\'s draft_hr_letter tool — review the bilingual body, edit if needed, then flip to "sent".',
    backLink: '← Back to HR',
    draft: 'Drafts', sent: 'Sent', signed: 'Signed', void: 'Void',
    colSubject: 'Subject',
    colEmployee: 'Employee',
    colType: 'Type',
    colStatus: 'Status',
    colCreated: 'Created',
    open: 'Open',
    none: 'No letters yet. Ask the WhatsApp agent: "draft a written warning for <employee> about <reason>" or "salary certificate for <employee>".',
  },
  ar: {
    pageTitle: 'خطابات الموارد البشرية',
    pageSub: 'إنذارات، إنهاءات، شهادات راتب، شهادات عدم ممانعة وخطابات خبرة وفق نظام العمل السعودي. تصل المسودات هنا من وكيل واتساب — راجع النص ثنائي اللغة، عدّل، ثم حدّد كـ"مُرسلة".',
    backLink: '← العودة',
    draft: 'مسودات', sent: 'مُرسلة', signed: 'موقّعة', void: 'ملغاة',
    colSubject: 'الموضوع', colEmployee: 'الموظف', colType: 'النوع', colStatus: 'الحالة', colCreated: 'تاريخ الإنشاء', open: 'فتح',
    none: 'لا توجد خطابات. اطلب من وكيل واتساب صياغة إنذار / شهادة راتب / خطاب خبرة.',
  },
} as const

const statusBadge: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  sent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  signed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  superseded: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  void: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const typeLabel: Record<string, { en: string; ar: string; color: string }> = {
  verbal_warning:     { en: 'Verbal warning',     ar: 'إنذار شفهي',         color: 'text-amber-700 dark:text-amber-300' },
  written_warning:    { en: 'Written warning',    ar: 'إنذار كتابي',        color: 'text-orange-700 dark:text-orange-300' },
  final_warning:      { en: 'Final warning',      ar: 'إنذار نهائي',        color: 'text-red-700 dark:text-red-300' },
  termination:        { en: 'Termination',        ar: 'إنهاء',              color: 'text-red-800 dark:text-red-400' },
  salary_certificate: { en: 'Salary certificate', ar: 'شهادة راتب',         color: 'text-blue-700 dark:text-blue-300' },
  employment_letter:  { en: 'Employment letter',  ar: 'خطاب عمل',           color: 'text-blue-700 dark:text-blue-300' },
  noc:                { en: 'NOC',                ar: 'عدم ممانعة',          color: 'text-indigo-700 dark:text-indigo-300' },
  experience_letter:  { en: 'Experience letter',  ar: 'شهادة خبرة',         color: 'text-emerald-700 dark:text-emerald-300' },
  custom:             { en: 'Custom',             ar: 'مخصص',                color: 'text-gray-700 dark:text-gray-300' },
}

export default async function LettersPage() {
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const ar = locale === 'ar'

  const { data: letters } = await (supabaseClient as any)
    .from('hr_letters')
    .select('id, employee_id, letter_type, subject, status, delivered_at, created_at, team_members:employee_id (full_name, full_name_ar)')
    .order('created_at', { ascending: false })

  const rows = (letters as any[]) ?? []
  const counts = {
    draft: rows.filter((r) => r.status === 'draft').length,
    sent: rows.filter((r) => r.status === 'sent').length,
    signed: rows.filter((r) => r.status === 'signed').length,
    void: rows.filter((r) => r.status === 'void').length,
  }

  const statusLabelMap: Record<string, string> = {
    draft: t.draft, sent: t.sent, signed: t.signed, void: t.void,
  }

  return (
    <div className="space-y-6 pb-10" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <FileText className="h-7 w-7 text-indigo-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/hr" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">{t.backLink}</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="premium-card p-4 border-l-4 border-l-amber-500">
          <p className="text-2xl font-black">{counts.draft}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.draft}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-emerald-500">
          <p className="text-2xl font-black">{counts.sent}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.sent}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-blue-500">
          <p className="text-2xl font-black">{counts.signed}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.signed}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-red-500">
          <p className="text-2xl font-black">{counts.void}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.void}</p>
        </div>
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
              <tr>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colSubject}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colEmployee}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colType}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colStatus}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colCreated}</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-12 text-center text-xs italic text-[hsl(var(--muted-foreground))]">{t.none}</td></tr>
              )}
              {rows.map((r) => {
                const tl = typeLabel[r.letter_type] ?? typeLabel.custom
                return (
                  <tr key={r.id} className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
                    <td className="px-3 py-2 font-semibold">{r.subject}</td>
                    <td className="px-3 py-2 text-xs">{r.team_members?.full_name ?? '—'}</td>
                    <td className={`px-3 py-2 text-xs font-bold ${tl.color}`}>{ar ? tl.ar : tl.en}</td>
                    <td className="px-3 py-2">
                      <span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusBadge[r.status] || statusBadge.draft}`}>
                        {statusLabelMap[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                      {new Date(r.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/hr/letters/${r.id}`} className="btn btn-ghost btn-xs">{t.open}</Link>
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
