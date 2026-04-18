import { supabaseClient } from "@/lib/supabase/client"
import { OpenClawPageBridge } from "@/components/layout/OpenClawPageBridge"
import { InstagramDashboardContent } from "./InstagramDashboardContent"

export const revalidate = 0

export default async function InstagramPage() {
  const [
    { data: clients },
    { data: teamMembers },
    { data: contentItems },
    { data: socialAccounts },
  ] = await Promise.all([
    (supabaseClient as any).from('clients').select('id, company_name'),
    (supabaseClient as any).from('team_members').select('id, full_name'),
    (supabaseClient as any).from('content_items').select('*').eq('platform', 'instagram').order('publish_date', { ascending: true }),
    (supabaseClient as any).from('social_accounts').select('*').eq('platform', 'instagram'),
  ])

  return (
    <>
      <OpenClawPageBridge page="social/instagram" platform="instagram" />
      <InstagramDashboardContent 
        clients={clients || []} 
        teamMembers={teamMembers || []}
        contentItems={contentItems || []}
        socialAccounts={socialAccounts || []}
      />
    </>
  )
}
