import { notFound } from 'next/navigation'
import { agentSupabase } from '@/lib/chat-agent/supabase'
import ReportEditor from './ReportEditor'

export const revalidate = 0

export default async function ReportEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { data: report, error } = await agentSupabase()
    .from('weekly_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !report) return notFound()

  return <ReportEditor report={report} />
}
