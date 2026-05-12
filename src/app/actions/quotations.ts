'use server'

import { supabaseClient } from '@/lib/supabase/client'
import { agentSupabase } from '@/lib/chat-agent/supabase'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Generates Q-YYYY-NNN using the highest existing number for the current
// year + 1. Race-condition on concurrent creates is acceptable for a
// single-user agency — the UNIQUE constraint on quote_number will reject
// duplicates if it ever happens.
export async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `Q-${year}-`
  // Service-role client so the lookup isn't blocked by RLS in production
  const sb = agentSupabase()
  const { data, error } = await sb
    .from('quotations')
    .select('quote_number')
    .like('quote_number', `${prefix}%`)
    .order('quote_number', { ascending: false })
    .limit(1)
  if (error) throw new Error(`quote_number lookup failed: ${error.message}`)
  const last = (data?.[0] as any)?.quote_number as string | undefined
  const n = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(n).padStart(3, '0')}`
}

export async function createBlankQuotation() {
  const quote_number = await nextQuoteNumber()
  const today = new Date()
  const validUntil = new Date(today)
  validUntil.setDate(validUntil.getDate() + 30)

  // Use service-role client — `quotations` has RLS that blocks anon
  // inserts, which was 500-ing /quotations/new for users.
  const sb = agentSupabase()
  const { data, error } = await sb
    .from('quotations')
    .insert({
      quote_number,
      issue_date: today.toISOString().split('T')[0],
      valid_until: validUntil.toISOString().split('T')[0],
    })
    .select()
    .single()
  if (error) throw new Error(`create quotation failed: ${error.message}`)

  revalidatePath('/quotations')
  redirect(`/quotations/${data.id}`)
}

export async function deleteQuotation(id: string) {
  const sb = agentSupabase()
  const { error } = await sb.from('quotations').delete().eq('id', id)
  if (error) throw new Error(`delete quotation failed: ${error.message}`)
  revalidatePath('/quotations')
  redirect('/quotations')
}

// Marks a quotation as accepted AND spins up a contract row from its data.
// One-shot conversion that gets you from "client said yes" → live contract
// without re-typing anything. Returns the new contract id so the caller
// can navigate to it.
export async function acceptQuoteCreateContract(
  quoteId: string,
): Promise<{ contract_id: string; redirect_to: string }> {
  const sb = supabaseClient as any

  const { data: quote, error: qErr } = await sb
    .from('quotations')
    .select('*')
    .eq('id', quoteId)
    .single()
  if (qErr || !quote) throw new Error(`quotation not found: ${qErr?.message ?? quoteId}`)

  if (quote.status === 'accepted' || quote.status === 'paid') {
    throw new Error(`Quote ${quote.quote_number} is already ${quote.status}.`)
  }

  const { data: items } = await sb
    .from('quotation_items')
    .select('qty, unit_price, pricing_mode')
    .eq('quotation_id', quoteId)

  // Total = subtotal + VAT, ignoring percentage-mode line items (they're
  // contingent on profit so don't carry a fixed value into the contract).
  const subtotal = (items || []).reduce((s: number, it: any) => {
    if (it.pricing_mode === 'percentage') return s
    return s + Number(it.qty ?? 1) * Number(it.unit_price ?? 0)
  }, 0)
  const vatRate = Number(quote.vat_rate ?? 15)
  const total = Math.round(subtotal * (1 + vatRate / 100))

  // Look up or fall back: quote.client_id is optional. If unlinked, we
  // create the contract without a client_id — admin can attach later.
  const today = new Date().toISOString().split('T')[0]
  const oneYearOut = new Date()
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1)

  const contractRow = {
    client_id: quote.client_id ?? null,
    title: `${quote.quote_number} — ${quote.client_company || quote.client_name_en || quote.client_name_ar || 'Untitled'}`,
    contract_type: 'service',
    start_date: today,
    end_date: oneYearOut.toISOString().split('T')[0],
    status: 'unsigned',
    value: total,
    notes: `Auto-created from quotation ${quote.quote_number}.${quote.notes ? '\n\nQuote notes:\n' + quote.notes : ''}`,
  }

  const { data: contract, error: cErr } = await sb
    .from('contracts')
    .insert(contractRow)
    .select('id')
    .single()
  if (cErr) throw new Error(`create contract failed: ${cErr.message}`)

  // Flip quote status. Don't fail the whole op if this errors — the
  // contract is already created, status is just a label.
  await sb.from('quotations').update({ status: 'accepted' }).eq('id', quoteId)

  // Notify admin so the bell + WhatsApp pick it up.
  try {
    await sb.from('notifications').insert({
      user_id: null, // admin-broadcast
      title: 'Quote accepted → contract created',
      message: `${quote.quote_number} (${total.toLocaleString('en-US')} SAR) generated contract.`,
      type: 'contract_alert',
      related_id: contract.id,
      is_read: false,
    })
  } catch { /* swallow */ }

  revalidatePath('/quotations')
  revalidatePath(`/quotations/${quoteId}`)
  revalidatePath('/contracts')
  revalidatePath('/notifications')

  return {
    contract_id: contract.id,
    redirect_to: '/contracts',
  }
}
