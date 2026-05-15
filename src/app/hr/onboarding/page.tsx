import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { ClipboardList } from 'lucide-react'
import { OnboardingChecklistCard } from './OnboardingChecklistCard'
import { StartOnboardingPicker } from './StartOnboardingPicker'

export const revalidate = 30

const T = {
  en: {
    pageTitle: 'Onboarding',
    pageSub: 'Per-employee onboarding checklists. The AI auto-picks a template (Saudi vs expat / full-time vs contractor) when an employee is first added, but you can start one manually here too.',
    backLink: '← Back to HR',
    inProgress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    startTitle: 'Start a new onboarding',
    none: "Nobody is onboarding right now. Click Start to begin one for a recent hire, or call promote_candidate_to_employee on a candidate — onboarding auto-starts.",
  },
  ar: {
    pageTitle: 'التوظيف الجديد',
    pageSub: 'قوائم تأهيل الموظفين الجدد. يختار النظام القالب المناسب تلقائياً (سعودي / غير سعودي، دوام كامل / مقاول) عند إضافة الموظف، ويمكنك أيضاً بدء قائمة يدوياً هنا.',
    backLink: '← العودة',
    inProgress: 'جارية',
    completed: 'مكتملة',
    cancelled: 'ملغاة',
    startTitle: 'بدء توظيف جديد',
    none: 'لا توجد عمليات توظيف نشطة. اضغط "بدء" لإنشاء واحدة لموظف حديث.',
  },
} as const

export default async function OnboardingPage() {
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const ar = locale === 'ar'

  const [{ data: checklists }, { data: emps }] = await Promise.all([
    (supabaseClient as any).from('onboarding_checklists')
      .select('id, employee_id, template, status, started_at, completed_at, team_members:employee_id (full_name, full_name_ar, hire_date)')
      .order('started_at', { ascending: false }),
    (supabaseClient as any).from('team_members')
      .select('id, full_name, hire_date, employment_type, nationality')
      .eq('status', 'active')
      .order('hire_date', { ascending: false, nullsFirst: false })
      .limit(40),
  ])

  const all = (checklists as any[]) ?? []
  const inProgress = all.filter((c) => c.status === 'in_progress')
  const completed = all.filter((c) => c.status === 'completed')

  // Per-checklist items
  const checklistIds = all.map((c) => c.id)
  let itemsByChecklist = new Map<string, any[]>()
  if (checklistIds.length) {
    const { data: items } = await (supabaseClient as any)
      .from('onboarding_checklist_items')
      .select('*')
      .in('checklist_id', checklistIds)
      .order('position')
    for (const it of (items as any[]) ?? []) {
      const arr = itemsByChecklist.get(it.checklist_id) ?? []
      arr.push(it)
      itemsByChecklist.set(it.checklist_id, arr)
    }
  }

  // Eligible employees for "start onboarding" — anyone without an existing checklist
  const checklistEmpIds = new Set(all.map((c) => c.employee_id))
  const eligible = ((emps as any[]) ?? []).filter((e) => !checklistEmpIds.has(e.id))

  return (
    <div className="space-y-6 pb-10" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <ClipboardList className="h-7 w-7 text-blue-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/hr" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">{t.backLink}</Link>
      </div>

      <StartOnboardingPicker eligible={eligible} ar={ar} title={t.startTitle} />

      <div className="grid grid-cols-3 gap-3">
        <div className="premium-card p-4 border-l-4 border-l-amber-500">
          <p className="text-2xl font-black">{inProgress.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.inProgress}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-emerald-500">
          <p className="text-2xl font-black">{completed.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.completed}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-gray-500">
          <p className="text-2xl font-black">{all.filter((c) => c.status === 'cancelled').length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.cancelled}</p>
        </div>
      </div>

      {all.length === 0 && (
        <div className="premium-card p-10 text-center">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{t.none}</p>
        </div>
      )}

      <div className="space-y-3">
        {inProgress.map((c) => (
          <OnboardingChecklistCard key={c.id} checklist={c} items={itemsByChecklist.get(c.id) ?? []} ar={ar} />
        ))}
        {completed.map((c) => (
          <OnboardingChecklistCard key={c.id} checklist={c} items={itemsByChecklist.get(c.id) ?? []} ar={ar} collapsed />
        ))}
      </div>
    </div>
  )
}
