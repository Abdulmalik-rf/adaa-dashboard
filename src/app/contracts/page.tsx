import { supabaseClient } from "@/lib/supabase/client"
import { ContractsClient } from "./ContractsClient"

export const revalidate = 0

export default async function ContractsPage() {
  const [{ data: contracts }, { data: clients }] = await Promise.all([
    (supabaseClient as any).from('contracts').select('*').order('end_date', { ascending: true }),
    (supabaseClient as any).from('clients').select('id, company_name'),
  ])

  return <ContractsClient contracts={contracts || []} clients={clients || []} />
}
