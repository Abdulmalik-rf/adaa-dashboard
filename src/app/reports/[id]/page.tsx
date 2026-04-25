import { supabaseClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import ReportView from './ReportView'

export const revalidate = 0

export default async function WeeklyReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { data: report, error } = await (supabaseClient as any)
    .from('weekly_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !report) return notFound()

  return <ReportView report={report} />
}
