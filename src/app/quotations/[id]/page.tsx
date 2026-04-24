import { supabaseClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import QuotationView from './QuotationView'

export const revalidate = 0

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [{ data: q, error: qe }, { data: items, error: ie }] = await Promise.all([
    (supabaseClient as any).from('quotations').select('*').eq('id', id).maybeSingle(),
    (supabaseClient as any).from('quotation_items').select('*').eq('quotation_id', id).order('position', { ascending: true }),
  ])

  if (qe || ie || !q) return notFound()

  return <QuotationView q={q} items={items ?? []} />
}
