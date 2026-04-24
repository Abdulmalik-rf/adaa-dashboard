'use server'

import { supabaseClient } from '@/lib/supabase/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Generates Q-YYYY-NNN using the highest existing number for the current
// year + 1. Race-condition on concurrent creates is acceptable for a
// single-user agency — the UNIQUE constraint on quote_number will reject
// duplicates if it ever happens.
export async function nextQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `Q-${year}-`
  const { data, error } = await (supabaseClient as any)
    .from('quotations')
    .select('quote_number')
    .like('quote_number', `${prefix}%`)
    .order('quote_number', { ascending: false })
    .limit(1)
  if (error) throw new Error(`quote_number lookup failed: ${error.message}`)
  const last = data?.[0]?.quote_number as string | undefined
  const n = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(n).padStart(3, '0')}`
}

export async function createBlankQuotation() {
  const quote_number = await nextQuoteNumber()
  const today = new Date()
  const validUntil = new Date(today)
  validUntil.setDate(validUntil.getDate() + 30)

  const { data, error } = await (supabaseClient as any)
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
  const { error } = await (supabaseClient as any).from('quotations').delete().eq('id', id)
  if (error) throw new Error(`delete quotation failed: ${error.message}`)
  revalidatePath('/quotations')
  redirect('/quotations')
}
