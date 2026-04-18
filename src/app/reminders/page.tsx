import { supabaseClient } from "@/lib/supabase/client"
import { RemindersClient } from "./RemindersClient"

export const revalidate = 0

export default async function RemindersPage() {
  const [{ data: reminders }, { data: clients }] = await Promise.all([
    (supabaseClient as any).from('reminders').select('*').order('due_date', { ascending: true }),
    (supabaseClient as any).from('clients').select('id, company_name'),
  ])
  return <RemindersClient reminders={reminders || []} clients={clients || []} />
}
