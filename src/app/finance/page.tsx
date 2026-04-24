import { supabaseClient } from "@/lib/supabase/client"
import { FinanceContent } from "./FinanceContent"

export const revalidate = 0

export default async function FinancePage() {
  const [
    { data: contracts },
    { data: clients },
    { data: campaigns },
    { data: contentItems },
  ] = await Promise.all([
    (supabaseClient as any).from('contracts').select('*'),
    (supabaseClient as any).from('clients').select('*'),
    (supabaseClient as any).from('ad_campaigns').select('*'),
    (supabaseClient as any).from('content_items').select('id, platform, client_id, schedule_status'),
  ])

  return (
    <FinanceContent
      contracts={contracts || []}
      clients={clients || []}
      campaigns={campaigns || []}
      contentItems={contentItems || []}
    />
  )
}
