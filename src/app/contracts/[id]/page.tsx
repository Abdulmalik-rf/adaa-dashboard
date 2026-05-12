import { supabaseClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import ContractView from './ContractView'

export const revalidate = 0

// Bilingual KSA-style contract detail page. Pulls the contract row, the
// optional payment schedule (contract_payments) and the linked client.
// Visual template lives in <ContractView/>.
export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [{ data: c, error: ce }, { data: payments }] = await Promise.all([
    (supabaseClient as any).from('contracts').select('*').eq('id', id).maybeSingle(),
    (supabaseClient as any)
      .from('contract_payments')
      .select('*')
      .eq('contract_id', id)
      .order('position', { ascending: true }),
  ])
  if (ce || !c) return notFound()

  let client: any = null
  if (c.client_id) {
    const { data } = await (supabaseClient as any)
      .from('clients')
      .select('id, company_name, full_name, phone, email, city, business_type, whatsapp')
      .eq('id', c.client_id)
      .maybeSingle()
    client = data ?? null
  }

  const { data: settings } = await (supabaseClient as any)
    .from('agency_settings')
    .select('agency_name, support_email')
    .eq('id', 'default')
    .maybeSingle()

  return (
    <ContractView
      contract={c}
      client={client}
      payments={payments ?? []}
      settings={settings ?? null}
    />
  )
}
