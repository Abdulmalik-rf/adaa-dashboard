import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { TrendingUp } from 'lucide-react'
import { PerformanceBriefBuilder } from './PerformanceBriefBuilder'

export const revalidate = 0

const T = {
  en: {
    pageTitle: 'Performance Briefs',
    pageSub: '1-on-1 prep doc: every employee\'s last-N-days work summary — tasks closed, clients touched, content posted, weekly reports authored, leave taken, attendance issues. Pick an employee + window and the AI builds the brief in seconds.',
    backLink: '← Back to HR',
  },
  ar: {
    pageTitle: 'تقارير الأداء',
    pageSub: 'تحضير اجتماع 1:1 — ملخص آخر N يوم لكل موظف: مهام مغلقة، عملاء مشتغلة، محتوى منشور، تقارير أسبوعية، إجازات، تأخير. اختر الموظف والفترة وسيُنشئ النظام التقرير في ثوانٍ.',
    backLink: '← العودة',
  },
} as const

export default async function PerformancePage() {
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const ar = locale === 'ar'

  const { data: emps } = await (supabaseClient as any)
    .from('team_members').select('id, full_name, job_title').eq('status', 'active').order('full_name')

  return (
    <div className="space-y-6 pb-10" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <TrendingUp className="h-7 w-7 text-purple-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/hr" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">{t.backLink}</Link>
      </div>

      <PerformanceBriefBuilder employees={(emps as any[]) ?? []} ar={ar} />
    </div>
  )
}
