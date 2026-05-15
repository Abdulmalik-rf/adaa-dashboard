'use server'

import { agentSupabase } from '@/lib/chat-agent/supabase'
import { getCurrentUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import * as qoyod from '@/lib/qoyod/client'

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
// Push to Qoyod — full chained implementation.
//
// On the first push for a client we POST /customers to create the Qoyod
// contact, cache the returned id on clients.qoyod_customer_id.
// On the first push for a particular line-item description (normalized
// via fingerprintDescription) we POST /products to create the Qoyod
// product, cache the returned id in our qoyod_products mapping table.
// Then we POST /invoices with the resolved contact_id + product_ids,
// and (if the receipt indicated payment) we also POST /invoice_payments
// against the configured payment account.
// =============================================================================

async function ensureQoyodCustomer(apiKey: string, clientId: string | null): Promise<number | null> {
  if (!clientId) return null
  const { data: c } = await sb()
    .from('clients')
    .select('id, qoyod_customer_id, company_name, full_name, email, phone, whatsapp, city')
    .eq('id', clientId)
    .maybeSingle()
  if (!c) return null
  if ((c as any).qoyod_customer_id) return (c as any).qoyod_customer_id
  const created = await qoyod.createCustomer(apiKey, {
    customer: {
      name: (c as any).company_name || (c as any).full_name || 'Client',
      email: (c as any).email || undefined,
      phone: (c as any).whatsapp || (c as any).phone || undefined,
      address: (c as any).city || undefined,
      contact_type: 'organization',
    },
  })
  const qid = created.customer.id
  try { await sb().from('clients').update({ qoyod_customer_id: qid }).eq('id', clientId) } catch { /* best-effort cache */ }
  return qid
}

async function ensureQoyodProduct(
  apiKey: string,
  description: string,
  unit_price: number,
  vat_rate: number,
): Promise<number> {
  const fingerprint = qoyod.fingerprintDescription(description) || 'misc-service'
  const { data: existing } = await sb()
    .from('qoyod_products')
    .select('qoyod_product_id')
    .eq('fingerprint', fingerprint)
    .maybeSingle()
  if ((existing as any)?.qoyod_product_id) return (existing as any).qoyod_product_id

  const created = await qoyod.createProduct(apiKey, {
    product: {
      name_en: description.slice(0, 120),
      name_ar: description.slice(0, 120),
      description: description,
      unit_price,
      tax_percent: vat_rate,
      product_type: 'service',
    },
  })
  const pid = created.product.id
  try {
    await sb().from('qoyod_products').insert({
      fingerprint,
      description,
      qoyod_product_id: pid,
      default_unit_price: unit_price,
    })
  } catch { /* best-effort cache */ }
  return pid
}

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
      .select('qoyod_api_key, qoyod_default_inventory_id, qoyod_default_payment_account')
      .eq('id', 'default')
      .maybeSingle()
    const apiKey = (settings as any)?.qoyod_api_key

    if (!apiKey) {
      await sb()
        .from('accounting_invoices')
        .update({ push_error: 'Qoyod API key not configured in Settings → Accounting.' })
        .eq('id', id)
      revalidatePath('/accounting')
      return { ok: false, error: 'Qoyod API key not configured. Open Settings → Accounting and paste the API key from your Qoyod dashboard (Settings → API). Then retry push.' }
    }

    const inventory_id = (settings as any)?.qoyod_default_inventory_id ?? undefined
    const payment_account = (settings as any)?.qoyod_default_payment_account ?? null

    try {
      // 1. Ensure customer exists in Qoyod
      const contact_id = await ensureQoyodCustomer(apiKey, (inv as any).client_id)
      if (!contact_id) {
        throw new Error('Cannot resolve Qoyod customer — invoice has no client_id and no customer_name to create from. Edit the invoice and attach a CRM client first.')
      }

      // 2. Ensure each line item has a Qoyod product id
      const lineItems = Array.isArray((inv as any).line_items) ? (inv as any).line_items : []
      const vat_rate = Number((inv as any).vat_rate ?? 15)
      const qoyodLines: qoyod.QoyodInvoiceLine[] = []
      for (const line of lineItems) {
        const desc = String(line.description || 'Service')
        const unit_price = Number(line.unit_price ?? 0)
        const product_id = await ensureQoyodProduct(apiKey, desc, unit_price, vat_rate)
        qoyodLines.push({
          product_id,
          description: desc,
          quantity: Number(line.qty ?? 1),
          unit_price,
          tax_percent: Number(line.vat_rate ?? vat_rate),
        })
      }
      if (qoyodLines.length === 0) {
        throw new Error('Invoice has no line items — add at least one before pushing.')
      }

      // 3. POST /invoices
      const created = await qoyod.createInvoice(apiKey, {
        invoice: {
          contact_id,
          reference: (inv as any).invoice_number,
          description: (inv as any).notes || undefined,
          issue_date: (inv as any).issue_date,
          due_date: (inv as any).issue_date,
          status: 'Approved',
          inventory_id,
          line_items: qoyodLines,
        },
      })

      // 4. If we have a payment_date + payment account, record the payment too
      let paymentNoted = false
      if ((inv as any).payment_date && payment_account) {
        try {
          await qoyod.createInvoicePayment(apiKey, {
            invoice_payment: {
              reference: (inv as any).payment_reference || `pay-${created.invoice.id}`,
              invoice_id: created.invoice.id,
              account_id: payment_account,
              date: (inv as any).payment_date,
              amount: String((inv as any).total ?? 0),
              payment_method: (inv as any).payment_method || undefined,
            },
          })
          paymentNoted = true
        } catch (payErr: any) {
          // Don't fail the whole push just because the payment record didn't
          // land. The invoice itself is the critical artifact.
          console.warn('[qoyod] payment record failed:', payErr?.message)
        }
      }

      // 5. Flip status, store the external id
      const externalUrl = `https://www.qoyod.com/invoices/${created.invoice.id}`
      await sb()
        .from('accounting_invoices')
        .update({
          status: 'pushed',
          external_system: 'qoyod',
          external_id: String(created.invoice.id),
          external_url: externalUrl,
          external_pushed_at: new Date().toISOString(),
          push_error: null,
        })
        .eq('id', id)

      revalidatePath('/accounting')
      revalidatePath(`/accounting/${id}`)
      return { ok: true, external_id: String(created.invoice.id), external_url: externalUrl }
    } catch (pushErr: any) {
      const msg = pushErr?.message ?? 'Unexpected error'
      await sb()
        .from('accounting_invoices')
        .update({ status: 'failed', push_error: msg })
        .eq('id', id)
      revalidatePath('/accounting')
      revalidatePath(`/accounting/${id}`)
      return { ok: false, error: msg }
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// =============================================================================
// Qoyod settings helpers — used by the Settings page form
// =============================================================================
export async function saveQoyodConfig(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
    const patch: Record<string, any> = {}
    const apiKey = String(formData.get('qoyod_api_key') ?? '').trim()
    if (apiKey) patch.qoyod_api_key = apiKey
    for (const k of ['qoyod_default_inventory_id', 'qoyod_default_revenue_account', 'qoyod_default_payment_account']) {
      const raw = String(formData.get(k) ?? '').trim()
      if (raw) patch[k] = Number(raw)
    }
    const orgName = String(formData.get('qoyod_org_name') ?? '').trim()
    if (orgName) patch.qoyod_org_name = orgName
    if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to save.' }
    const { error } = await sb().from('agency_settings').update(patch).eq('id', 'default')
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    revalidatePath('/accounting')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function testQoyodConnection(): Promise<
  { ok: true; accounts: number; inventories?: number } | { ok: false; error: string }
> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
  const { data: settings } = await sb()
    .from('agency_settings').select('qoyod_api_key').eq('id', 'default').maybeSingle()
  const key = (settings as any)?.qoyod_api_key
  if (!key) return { ok: false, error: 'No Qoyod API key saved yet.' }
  const probe = await qoyod.ping(key)
  if (!probe.ok) return { ok: false, error: probe.error }
  try {
    const inv = await qoyod.listInventories(key)
    return { ok: true, accounts: probe.accounts, inventories: inv.inventories?.length ?? 0 }
  } catch {
    return { ok: true, accounts: probe.accounts }
  }
}
