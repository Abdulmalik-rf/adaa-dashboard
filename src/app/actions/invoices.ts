'use server'

import { agentSupabase } from '@/lib/chat-agent/supabase'
import { getCurrentUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// =============================================================================
// VAT-invoice workflow: payment receipt → draft → admin approval → push to
// the external accounting system (Qoyod). Phase 1 covers everything up
// through approval; the push step is stubbed until Qoyod credentials are
// added to agency_settings.
// =============================================================================

const sb = () => agentSupabase()

// INV-YYYY-NNN sequential per calendar year. Race-condition-tolerant for a
// single-admin agency — the UNIQUE constraint on invoice_number catches the
// rare double-issue.
export async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const { data } = await sb()
    .from('accounting_invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`)
    .order('invoice_number', { ascending: false })
    .limit(1)
  const last = (data as any)?.[0]?.invoice_number as string | undefined
  const n = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(n).padStart(3, '0')}`
}

// Create a draft invoice from extracted receipt data + the originating
// quotation's line items (when we can find one). Called by the WhatsApp
// agent after it parses a payment-receipt PDF.
export type DraftInvoiceInput = {
  client_id?: string | null
  quotation_id?: string | null
  contract_id?: string | null
  receipt_url?: string | null
  customer_name?: string | null
  customer_vat?: string | null
  customer_cr?: string | null
  customer_address?: string | null
  payment_date?: string | null
  payment_method?: string | null
  payment_reference?: string | null
  currency?: string
  // Caller usually passes either explicit line_items OR a total — if only the
  // total is known (from the receipt), we generate a single placeholder line
  // that the admin can edit before approving.
  line_items?: Array<{
    description: string
    qty?: number
    unit_price?: number
    vat_rate?: number
    vat_amount?: number
    line_total?: number
  }>
  subtotal?: number | null
  vat_rate?: number
  vat_amount?: number | null
  total?: number | null
  notes?: string | null
}

export async function createDraftInvoice(
  input: DraftInvoiceInput,
): Promise<{ ok: true; id: string; invoice_number: string } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    const currency = input.currency || 'SAR'
    const vat_rate = input.vat_rate ?? 15
    let line_items = Array.isArray(input.line_items) ? input.line_items : []

    // If no explicit lines but a total exists, materialize a single
    // placeholder line so the totals row math works.
    if (line_items.length === 0 && (input.total || input.subtotal)) {
      const lineTotal = input.subtotal ?? Math.round(((input.total ?? 0) / (1 + vat_rate / 100)) * 100) / 100
      line_items = [{
        description: 'Services rendered (auto-extracted from payment receipt — please edit before approving)',
        qty: 1,
        unit_price: lineTotal,
        vat_rate,
        vat_amount: Math.round(lineTotal * vat_rate) / 100,
        line_total: lineTotal,
      }]
    }

    // Recompute totals server-side so the line_items are the source of truth.
    const subtotal = line_items.reduce((s, l) => s + Number(l.line_total ?? (Number(l.qty ?? 1) * Number(l.unit_price ?? 0))), 0)
    const vat_amount = input.vat_amount ?? Math.round(subtotal * vat_rate) / 100
    const total = input.total ?? Math.round((subtotal + vat_amount) * 100) / 100

    const invoice_number = await nextInvoiceNumber()

    const row = {
      client_id: input.client_id ?? null,
      quotation_id: input.quotation_id ?? null,
      contract_id: input.contract_id ?? null,
      receipt_url: input.receipt_url ?? null,
      invoice_number,
      issue_date: new Date().toISOString().slice(0, 10),
      payment_date: input.payment_date ?? null,
      payment_method: input.payment_method ?? null,
      payment_reference: input.payment_reference ?? null,
      customer_name: input.customer_name ?? null,
      customer_vat: input.customer_vat ?? null,
      customer_cr: input.customer_cr ?? null,
      customer_address: input.customer_address ?? null,
      currency,
      line_items,
      subtotal,
      vat_rate,
      vat_amount,
      total,
      notes: input.notes ?? null,
      status: 'draft',
      created_by: me?.id ?? null,
    }

    const { data, error } = await sb()
      .from('accounting_invoices')
      .insert(row)
      .select('id, invoice_number')
      .single()
    if (error || !data) return { ok: false, error: `Insert failed: ${error?.message ?? 'unknown'}` }

    // Ping the admin so they know there's a draft waiting for review.
    try {
      await sb().from('notifications').insert({
        user_id: null,
        title: `Draft VAT invoice ${(data as any).invoice_number}`,
        message: `${input.customer_name || 'Client'} — ${total.toLocaleString('en-US')} ${currency} (VAT ${vat_amount.toLocaleString('en-US')}). Open /accounting to approve and push.`,
        type: 'invoice_draft',
        related_id: (data as any).id,
        is_read: false,
      })
    } catch { /* swallow — notification is informational */ }

    revalidatePath('/accounting')
    revalidatePath('/notifications')
    return { ok: true, id: (data as any).id, invoice_number: (data as any).invoice_number }
  } catch (err: any) {
    console.error('createDraftInvoice crashed:', err)
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// Update editable fields on a draft. Used by the dashboard's edit form.
export async function updateDraftInvoice(
  id: string,
  patch: Partial<DraftInvoiceInput> & { line_items?: any[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const allowed: Record<string, any> = {}
    for (const k of [
      'client_id', 'quotation_id', 'contract_id',
      'customer_name', 'customer_vat', 'customer_cr', 'customer_address',
      'payment_date', 'payment_method', 'payment_reference',
      'currency', 'notes',
    ]) {
      if ((patch as any)[k] !== undefined) allowed[k] = (patch as any)[k]
    }

    // Recompute totals when line_items change.
    if (Array.isArray(patch.line_items)) {
      allowed.line_items = patch.line_items
      const vat_rate = patch.vat_rate ?? 15
      const subtotal = patch.line_items.reduce(
        (s: number, l: any) => s + Number(l.line_total ?? (Number(l.qty ?? 1) * Number(l.unit_price ?? 0))),
        0,
      )
      const vat_amount = Math.round(subtotal * vat_rate) / 100
      allowed.subtotal = subtotal
      allowed.vat_rate = vat_rate
      allowed.vat_amount = vat_amount
      allowed.total = Math.round((subtotal + vat_amount) * 100) / 100
    }

    const { error } = await sb().from('accounting_invoices').update(allowed).eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/accounting')
    revalidatePath(`/accounting/${id}`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// Flip status draft → approved. The admin signs off but we don't push to
// Qoyod yet — that's a separate explicit action so the admin can spot-check
// before anything goes to the accounting system.
export async function approveInvoice(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') {
      return { ok: false, error: 'Only admins can approve invoices.' }
    }
    const { error } = await sb()
      .from('accounting_invoices')
      .update({ status: 'approved', approved_by: me.id, approved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'draft') // only transition from draft
    if (error) return { ok: false, error: error.message }
    revalidatePath('/accounting')
    revalidatePath(`/accounting/${id}`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// Walk back to draft (e.g. admin noticed a typo after approving).
export async function unapproveInvoice(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') return { ok: false, error: 'Only admins can unapprove invoices.' }
  const { error } = await sb()
    .from('accounting_invoices')
    .update({ status: 'draft', approved_at: null, approved_by: null })
    .eq('id', id)
    .eq('status', 'approved')
  if (error) return { ok: false, error: error.message }
  revalidatePath('/accounting')
  revalidatePath(`/accounting/${id}`)
  return { ok: true }
}

// Soft-delete: status = void. Kept in the DB for audit, hidden by default.
export async function voidInvoice(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') return { ok: false, error: 'Only admins can void invoices.' }
  const { error } = await sb().from('accounting_invoices').update({ status: 'void' }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/accounting')
  return { ok: true }
}

// =============================================================================
// Push to Qoyod — stub until credentials land in agency_settings.
//
// When ready, fill in QOYOD_API_BASE + the access token from agency_settings,
// map line_items → Qoyod's invoice schema, POST to /api/v1/invoices, capture
// the returned id + URL, flip status to 'pushed'.
// =============================================================================
export async function pushInvoiceToQoyod(id: string): Promise<
  { ok: true; external_id: string; external_url?: string } | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Only admins can push invoices.' }

    const { data: inv, error: fErr } = await sb()
      .from('accounting_invoices')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (fErr || !inv) return { ok: false, error: `Invoice not found: ${fErr?.message ?? id}` }
    if ((inv as any).status !== 'approved') {
      return { ok: false, error: `Invoice must be approved first (current status: ${(inv as any).status}).` }
    }

    const { data: settings } = await sb()
      .from('agency_settings')
      .select('qoyod_api_token_encrypted, qoyod_account_id')
      .eq('id', 'default')
      .maybeSingle()
    const token = (settings as any)?.qoyod_api_token_encrypted

    if (!token) {
      // Mark the attempt so the dashboard shows "credentials missing"
      await sb()
        .from('accounting_invoices')
        .update({ push_error: 'Qoyod API token not configured in Settings → Accounting.' })
        .eq('id', id)
      revalidatePath('/accounting')
      return { ok: false, error: 'Qoyod API token not configured. Go to Settings → Accounting and paste the access token from Qoyod (Settings → Developers → API).' }
    }

    // === Real Qoyod push lands here once credentials arrive ===
    // const res = await fetch('https://www.qoyod.com/api/v1/invoices', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${token}`,
    //     'API-VERSION': '3.0',
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify(mapToQoyodInvoice(inv)),
    // })
    // ...

    return { ok: false, error: 'Qoyod push not yet implemented — leave this turn open until you share the API token + chart-of-accounts IDs.' }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}
