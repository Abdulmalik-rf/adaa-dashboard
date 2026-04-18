import { supabaseClient } from "@/lib/supabase/client"
import { FilesClient } from "./FilesClient"

export const revalidate = 0

export default async function FilesPage() {
  const [{ data: files }, { data: clients }] = await Promise.all([
    (supabaseClient as any).from('client_files').select('*').order('created_at', { ascending: false }),
    (supabaseClient as any).from('clients').select('id, company_name'),
  ])
  return <FilesClient files={files || []} clients={clients || []} />
}
