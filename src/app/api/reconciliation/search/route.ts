import { NextResponse, type NextRequest } from 'next/server'
import { supabaseClient } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/server'

// Used by the manual-match picker on the reconciliation review page.
// Returns invoice or bill candidates the admin can link to a bank tx.
// Filter by type=invoice|bill. q matches against customer/vendor name or
// reference. amount narrows the result to rows within ±SAR 1.

export async function GET(request: NextRequest) {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') {
    return NextResponse.json({ error: 'admin only' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const type = sp.get('type')
  const q = (sp.get('q') || '').trim()
  const amount = Number(sp.get('amount') || 0)

  if (type !== 'invoice' && type !== 'bill') {
    return NextResponse.json({ error: 'type must be invoice|bill' }, { status: 400 })
  }

  if (type === 'invoice') {
    let query = (supabaseClient as any).from('accounting_invoices')
      .select('id, invoice_number, customer_name, total, issue_date, payment_reference')
      .neq('status', 'void')
      .order('created_at', { ascending: false })
      .limit(15)
    if (q) {
      query = query.or(
        `customer_name.ilike.%${q}%,invoice_number.ilike.%${q}%,payment_reference.ilike.%${q}%`,
      )
    }
    if (amount > 0) {
      query = query.gte('total', amount - 1).lte('total', amount + 1)
    }
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data ?? [] })
  }

  // bills
  let query = (supabaseClient as any).from('accounting_bills')
    .select('id, bill_reference, vendor_name, total, issue_date, payment_reference')
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(15)
  if (q) {
    query = query.or(
      `vendor_name.ilike.%${q}%,bill_reference.ilike.%${q}%,bill_number.ilike.%${q}%`,
    )
  }
  if (amount > 0) {
    query = query.gte('total', amount - 1).lte('total', amount + 1)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}
