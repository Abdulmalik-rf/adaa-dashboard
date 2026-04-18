import { supabaseClient } from "@/lib/supabase/client"
import { SchedulerClient } from "./SchedulerClient"

export const revalidate = 0

export default async function SchedulerPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; status?: string; view?: string }>
}) {
  const params = await searchParams

  const [
    { data: contentItems },
    { data: teamMembers },
    { data: clients },
  ] = await Promise.all([
    (supabaseClient as any).from('content_items').select('*').order('publish_date', { ascending: true }),
    (supabaseClient as any).from('team_members').select('id, full_name'),
    (supabaseClient as any).from('clients').select('id, company_name'),
  ])

  return (
    <SchedulerClient
      contentItems={contentItems || []}
      teamMembers={teamMembers || []}
      clients={clients || []}
      initialPlatform={params.platform || 'all'}
      initialStatus={params.status || 'all'}
      initialView={params.view || 'list'}
    />
  )
}
