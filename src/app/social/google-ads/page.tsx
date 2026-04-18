import { supabaseClient } from "@/lib/supabase/client"
import { OpenClawPageBridge } from "@/components/layout/OpenClawPageBridge"
import { GoogleAdsDashboardContent } from "./GoogleAdsDashboardContent"

export const revalidate = 0

export default async function GoogleAdsPage() {
  const [
    { data: clients },
    { data: teamMembers },
    { data: contentItems },
    { data: socialAccounts },
    { data: campaigns },
  ] = await Promise.all([
    (supabaseClient as any).from('clients').select('id, company_name'),
    (supabaseClient as any).from('team_members').select('id, full_name'),
    (supabaseClient as any).from('content_items').select('*').eq('platform', 'google_ads').order('publish_date', { ascending: true }),
    (supabaseClient as any).from('social_accounts').select('*').eq('platform', 'google_ads'),
    (supabaseClient as any).from('ad_campaigns').select('*'),
  ])

  return (
    <>
      <OpenClawPageBridge page="social/google-ads" platform="google_ads" />
      <GoogleAdsDashboardContent 
        clients={clients || []} 
        teamMembers={teamMembers || []}
        contentItems={contentItems || []}
        socialAccounts={socialAccounts || []}
        campaigns={campaigns || []}
      />
    </>
  )
}
