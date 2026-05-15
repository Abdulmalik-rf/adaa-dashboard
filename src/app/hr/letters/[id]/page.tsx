import { supabaseClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { ArrowLeft, FileText } from 'lucide-react'
import { LetterEditor } from './LetterEditor'

export const revalidate = 0

export default async function LetterDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const ar = locale === 'ar'

  const { data: letter, error } = await (supabaseClient as any)
    .from('hr_letters')
    .select('*, team_members:employee_id (full_name, full_name_ar, job_title, job_title_ar, email, whatsapp, phone)')
    .eq('id', id).maybeSingle()
  if (error || !letter) return notFound()

  return (
    <div className="space-y-6 pb-10 max-w-4xl mx-auto" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3">
        <Link href="/hr/letters" className="btn btn-ghost btn-icon">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <FileText className="h-6 w-6 text-indigo-500" />
            {letter.subject}
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {letter.letter_type.replace(/_/g, ' ')} · {letter.team_members?.full_name}
          </p>
        </div>
      </div>

      <LetterEditor letter={letter} ar={ar} />
    </div>
  )
}
