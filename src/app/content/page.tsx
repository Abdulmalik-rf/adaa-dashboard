import { supabaseClient } from "@/lib/supabase/client"
import { ContentKanban } from "./ContentKanban"

export const revalidate = 30

// Editorial kanban for the content_items table — five columns matching
// the workflow stages (idea → pending → approved → scheduled → published).
// Cards are clickable; status changes via a small status-picker on each
// card. content_items.schedule_status is the source of truth.

export default async function ContentPage() {
  const [
    { data: contentItems },
    { data: clients },
    { data: teamMembers },
  ] = await Promise.all([
    (supabaseClient as any).from('content_items').select('*').order('publish_date', { ascending: true }),
    (supabaseClient as any).from('clients').select('id, company_name'),
    (supabaseClient as any).from('team_members').select('id, full_name'),
  ])

  return (
    <ContentKanban
      items={contentItems || []}
      clients={clients || []}
      teamMembers={teamMembers || []}
    />
  )
}
