'use server'

import { agentSupabase } from '@/lib/chat-agent/supabase'
import { getCurrentUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import * as qoyod from '@/lib/qoyod/client'

// =============================================================================
// BILLS (accounts payable) — receipt or vendor invoice PDF → AI extracts →
// draft bill → admin approves → push to Qoyod as a /bills or /simple_bills.
// Mirrors invoices.ts but for the AP side.
// =============================================================================

const sb = () => agentSupabase()

export async function nextBillReference(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `BILL-${year}-`
  const { data } = await sb()
    .from('accounting_bills')
    .select('bill_reference')
    .like('bill_reference', `${prefix}%`)
    .order('bill_reference', { ascending: false })
    .limit(1)
  const last = (data as any)?.[0]?.bill_reference as string | undefined
  const n = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(n).padStart(3, '0')}`
}

export type DraftBillInput = {
  vendor_name: string
  vendor_vat?: string | null
  vendor_cr?: string | null
  vendor_address?: string | null
  receipt_url?: string | null
  bill_number?: string | null           // vendor's own invoice number
  issue_date?: string
  due_date?: string | null
  payment_date?: string | null
  payment_method?: string | null
  payment_reference?: string | null
  category?: string | null              // 'meals' / 'software' / 'fuel' / etc.
  is_simple?: boolean
  currency?: string
  line_items?: Array<{
    description: string
    qty?: number
    unit_price?: number
    vat_rate?: number
  }>
  subtotal?: number | null
  vat_rate?: number
  vat_amount?: number | null
  total?: number | null
  notes?: string | null
}

// Normalize a vendor name for category-mapping lookup.
function vendorFingerprint(name: string | null | undefined): string {
  if (!name) return ''
  return String(name)
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim()
    .slice(0, 120)
}

// Look up an existing category mapping for a vendor. Returns the suggested
// category + qoyod_expense_account_id when known.
export async function suggestCategory(
  vendor_name: string,
): Promise<{ category?: string; qoyod_expense_account_id?: number; hit_count?: number } | null> {
  const fp = vendorFingerprint(vendor_name)
  if (!fp) return null
  const { data } = await sb()
    .from('expense_category_mappings')
    .select('category, qoyod_expense_account_id, hit_count')
    .eq('vendor_fingerprint', fp)
    .maybeSingle()
  return (data as any) ?? null
}

// Insert or bump a category mapping when admin confirms a categorization.
async function rememberCategoryMapping(
  vendor_name: string,
  category: string,
  qoyod_expense_account_id?: number | null,
) {
  const fp = vendorFingerprint(vendor_name)
  if (!fp || !category) return
  const { data: existing } = await sb()
    .from('expense_category_mappings')
    .select('id, hit_count')
    .eq('vendor_fingerprint', fp)
    .maybeSingle()
  if (existing) {
    await sb()
      .from('expense_category_mappings')
      .update({
        category,
        qoyod_expense_account_id: qoyod_expense_account_id ?? null,
        hit_count: ((existing as any).hit_count ?? 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', (existing as any).id)
  } else {
    await sb().from('expense_category_mappings').insert({
      vendor_fingerprint: fp,
      vendor_name_sample: vendor_name,
      category,
      qoyod_expense_account_id: qoyod_expense_account_id ?? null,
    })
  }
}

export async function createDraftBill(input: DraftBillInput): Promise<
  { ok: true; id: string; bill_reference: string } | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    const currency = input.currency || 'SAR'
    const vat_rate = input.vat_rate ?? 15

    // Pull a category suggestion if not already provided.
    let category = input.category ?? null
    let qoyod_expense_account_id: number | null = null
    if (!category) {
      const sugg = await suggestCategory(input.vendor_name)
      if (sugg?.category) {
        category = sugg.category
        qoyod_expense_account_id = sugg.qoyod_expense_account_id ?? null
      }
    }

    let line_items = Array.isArray(input.line_items) ? input.line_items : []
    if (line_items.length === 0 && (input.total || input.subtotal)) {
      const lineTotal = input.subtotal ?? Math.round(((input.total ?? 0) / (1 + vat_rate / 100)) * 100) / 100
      line_items = [{
        description: `${input.vendor_name} — auto-extracted from receipt (please edit)`,
        qty: 1,
        unit_price: lineTotal,
        vat_rate,
      }]
    }

    const computedLines = line_items.map((l) => {
      const subtotal = Number(l.qty ?? 1) * Number(l.unit_price ?? 0)
      const vat = Math.round(subtotal * Number(l.vat_rate ?? vat_rate)) / 100
      return { ...l, vat_amount: vat, line_total: subtotal }
    })
    const subtotal = computedLines.reduce((s, l) => s + Number(l.line_total ?? 0), 0)
    const vat_amount = input.vat_amount ?? Math.round(subtotal * vat_rate) / 100
    const total = input.total ?? Math.round((subtotal + vat_amount) * 100) / 100

    const bill_reference = await nextBillReference()

    const row = {
      vendor_name: input.vendor_name,
      vendor_vat: input.vendor_vat ?? null,
      vendor_cr: input.vendor_cr ?? null,
      vendor_address: input.vendor_address ?? null,
      receipt_url: input.receipt_url ?? null,
      bill_number: input.bill_number ?? null,
      bill_reference,
      issue_date: input.issue_date ?? new Date().toISOString().slice(0, 10),
      due_date: input.due_date ?? null,
      payment_date: input.payment_date ?? null,
      payment_method: input.payment_method ?? null,
      payment_reference: input.payment_reference ?? null,
      category,
      qoyod_expense_account_id,
      is_simple: !!input.is_simple,
      currency,
      line_items: computedLines,
      subtotal,
      vat_rate,
      vat_amount,
      total,
      notes: input.notes ?? null,
      status: 'draft',
      created_by: me?.id ?? null,
    }

    const { data, error } = await sb()
      .from('accounting_bills')
      .insert(row)
      .select('id, bill_reference')
      .single()
    if (error || !data) return { ok: false, error: `Insert failed: ${error?.message ?? 'unknown'}` }

    try {
      await sb().from('notifications').insert({
        user_id: null,
        title: `Draft bill ${(data as any).bill_reference}`,
        message: `${input.vendor_name} — ${total.toLocaleString('en-US')} ${currency}${category ? ` (${category})` : ''}. Open /accounting/bills to review.`,
        type: 'bill_draft',
        related_id: (data as any).id,
        is_read: false,
      })
    } catch { /* swallow */ }

    revalidatePath('/accounting/bills')
    revalidatePath('/notifications')
    return { ok: true, id: (data as any).id, bill_reference: (data as any).bill_reference }
  } catch (err: any) {
    console.error('createDraftBill crashed:', err)
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function updateDraftBill(
  id: string,
  patch: Partial<DraftBillInput> & { line_items?: any[]; qoyod_expense_account_id?: number | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const allowed: Record<string, any> = {}
    for (const k of [
      'vendor_name', 'vendor_vat', 'vendor_cr', 'vendor_address',
      'bill_number', 'issue_date', 'due_date', 'payment_date',
      'payment_method', 'payment_reference', 'category',
      'qoyod_expense_account_id', 'is_simple', 'currency', 'notes',
    ]) {
      if ((patch as any)[k] !== undefined) allowed[k] = (patch as any)[k]
    }
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
    const { error } = await sb().from('accounting_bills').update(allowed).eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/accounting/bills')
    revalidatePath(`/accounting/bills/${id}`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function approveBill(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }

  // Snapshot the bill so we can teach the category mapper on approve
  // (admin's approval is the strongest signal that "Bukharah Foods → meals"
  // is correct).
  const { data: bill } = await sb()
    .from('accounting_bills')
    .select('vendor_name, category, qoyod_expense_account_id')
    .eq('id', id).maybeSingle()
  if (bill && (bill as any).vendor_name && (bill as any).category) {
    await rememberCategoryMapping((bill as any).vendor_name, (bill as any).category, (bill as any).qoyod_expense_account_id)
  }

  const { error } = await sb()
    .from('accounting_bills')
    .update({ status: 'approved', approved_by: me.id, approved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'draft')
  if (error) return { ok: false, error: error.message }
  revalidatePath('/accounting/bills')
  revalidatePath(`/accounting/bills/${id}`)
  return { ok: true }
}

export async function voidBill(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
  const { error } = await sb().from('accounting_bills').update({ status: 'void' }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/accounting/bills')
  return { ok: true }
}

// =============================================================================
// Push bill to Qoyod (same pattern as pushInvoiceToQoyod)
// =============================================================================
async function ensureQoyodVendor(apiKey: string, bill: any): Promise<number | null> {
  if (bill.qoyod_vendor_id) return bill.qoyod_vendor_id
  const fp = vendorFingerprint(bill.vendor_name)
  if (!fp) return null

  const { data: cached } = await sb()
    .from('qoyod_vendors').select('qoyod_vendor_id').eq('fingerprint', fp).maybeSingle()
  if ((cached as any)?.qoyod_vendor_id) {
    try { await sb().from('accounting_bills').update({ qoyod_vendor_id: (cached as any).qoyod_vendor_id }).eq('id', bill.id) } catch { /* */ }
    return (cached as any).qoyod_vendor_id
  }

  const created = await qoyod.createVendor(apiKey, {
    vendor: {
      name: bill.vendor_name,
      vat_number: bill.vendor_vat || undefined,
      cr_number: bill.vendor_cr || undefined,
      address: bill.vendor_address || undefined,
    },
  })
  const vid = created.vendor.id
  try {
    await sb().from('qoyod_vendors').insert({ fingerprint: fp, vendor_name: bill.vendor_name, qoyod_vendor_id: vid })
    await sb().from('accounting_bills').update({ qoyod_vendor_id: vid }).eq('id', bill.id)
  } catch { /* best-effort cache */ }
  return vid
}

export async function pushBillToQoyod(id: string): Promise<
  { ok: true; external_id: string; external_url?: string } | { ok: false; error: string }
> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }

    const { data: bill, error: fErr } = await sb()
      .from('accounting_bills').select('*').eq('id', id).maybeSingle()
    if (fErr || !bill) return { ok: false, error: `Bill not found: ${fErr?.message ?? id}` }
    if ((bill as any).status !== 'approved') {
      return { ok: false, error: `Bill must be approved first (currently: ${(bill as any).status}).` }
    }

    const { data: settings } = await sb()
      .from('agency_settings')
      .select('qoyod_api_key, qoyod_default_inventory_id, qoyod_default_payment_account')
      .eq('id', 'default').maybeSingle()
    const apiKey = (settings as any)?.qoyod_api_key
    if (!apiKey) {
      await sb().from('accounting_bills').update({ push_error: 'Qoyod API key not configured.' }).eq('id', id)
      return { ok: false, error: 'Qoyod API key not configured. Open Settings → Accounting and paste it.' }
    }

    try {
      const vendor_id = await ensureQoyodVendor(apiKey, bill)
      if (!vendor_id) throw new Error('Cannot resolve Qoyod vendor — bill has no vendor_name.')

      let externalId: number
      const issue_date = (bill as any).issue_date

      if ((bill as any).is_simple) {
        // Simple bill — single-line, no VAT breakdown
        const expense_account = (bill as any).qoyod_expense_account_id
        if (!expense_account) {
          throw new Error('Simple bill needs qoyod_expense_account_id — set the category or paste an account id on the bill before pushing.')
        }
        const created = await qoyod.createSimpleBill(apiKey, {
          simple_bill: {
            vendor_id,
            reference: (bill as any).bill_reference,
            description: (bill as any).notes || undefined,
            issue_date,
            due_date: (bill as any).due_date || issue_date,
            amount: Number((bill as any).total ?? 0),
            expense_account_id: expense_account,
            tax_percent: Number((bill as any).vat_rate ?? 15),
          },
        })
        externalId = created.simple_bill.id
      } else {
        // Full bill with itemized lines
        const vat_rate = Number((bill as any).vat_rate ?? 15)
        const lines = Array.isArray((bill as any).line_items) ? (bill as any).line_items : []
        if (lines.length === 0) throw new Error('Bill has no line items.')
        const qoyodLines = lines.map((l: any) => ({
          description: l.description || 'Expense',
          quantity: Number(l.qty ?? 1),
          unit_price: Number(l.unit_price ?? 0),
          tax_percent: Number(l.vat_rate ?? vat_rate),
          account_id: (bill as any).qoyod_expense_account_id ?? undefined,
        }))
        const created = await qoyod.createBill(apiKey, {
          bill: {
            vendor_id,
            reference: (bill as any).bill_reference,
            description: (bill as any).notes || undefined,
            issue_date,
            due_date: (bill as any).due_date || issue_date,
            status: 'Approved',
            inventory_id: (settings as any)?.qoyod_default_inventory_id ?? undefined,
            line_items: qoyodLines,
          },
        })
        externalId = created.bill.id
      }

      // Optionally record payment
      if ((bill as any).payment_date && (settings as any)?.qoyod_default_payment_account) {
        try {
          await qoyod.createBillPayment(apiKey, {
            bill_payment: {
              bill_id: externalId,
              account_id: (settings as any).qoyod_default_payment_account,
              date: (bill as any).payment_date,
              amount: String((bill as any).total ?? 0),
              reference: (bill as any).payment_reference || `pay-${externalId}`,
            },
          })
        } catch (payErr: any) {
          console.warn('[qoyod] bill payment record failed:', payErr?.message)
        }
      }

      const externalUrl = `https://www.qoyod.com/${(bill as any).is_simple ? 'simple_bills' : 'bills'}/${externalId}`
      await sb()
        .from('accounting_bills')
        .update({
          status: (bill as any).payment_date ? 'paid' : 'pushed',
          external_system: 'qoyod',
          external_id: String(externalId),
          external_url: externalUrl,
          external_pushed_at: new Date().toISOString(),
          push_error: null,
        })
        .eq('id', id)

      revalidatePath('/accounting/bills')
      revalidatePath(`/accounting/bills/${id}`)
      return { ok: true, external_id: String(externalId), external_url: externalUrl }
    } catch (pushErr: any) {
      const msg = pushErr?.message ?? 'Unexpected error'
      await sb().from('accounting_bills').update({ status: 'failed', push_error: msg }).eq('id', id)
      revalidatePath('/accounting/bills')
      return { ok: false, error: msg }
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}
