// =============================================================================
// Low-level wrapper around Qoyod's REST API (https://api.qoyod.com/2.0/).
//
// Auth: single `API-KEY` header per request (NOT OAuth — confirmed against
// Qoyod's Postman-published spec). Generate the key in Qoyod's dashboard at
// Settings → API → Personal access token.
//
// This file only handles the HTTP plumbing + typed payloads — business
// logic (cache lookups, idempotency, error mapping) lives in
// src/app/actions/invoices.ts which calls these primitives.
// =============================================================================

const BASE = 'https://api.qoyod.com/2.0'

export type QoyodInvoiceLine = {
  product_id: number
  description?: string
  quantity: number
  unit_price: number
  discount?: number
  discount_type?: 'percentage' | 'amount'
  tax_percent?: number
}

export type QoyodInvoicePayload = {
  invoice: {
    contact_id: number
    reference?: string
    description?: string
    issue_date: string  // YYYY-MM-DD
    due_date?: string
    status?: 'Draft' | 'Approved'
    inventory_id?: number
    line_items: QoyodInvoiceLine[]
    custom_fields?: Record<string, string>
  }
}

export type QoyodCustomerPayload = {
  customer: {
    name: string
    email?: string
    phone?: string
    address?: string
    vat_number?: string
    cr_number?: string
    contact_type?: 'individual' | 'organization'
  }
}

export type QoyodProductPayload = {
  product: {
    name_ar?: string
    name_en?: string
    sku?: string
    description?: string
    unit_price: number
    tax_percent?: number
    category_id?: number
    product_type?: 'simple' | 'service'
  }
}

export type QoyodPaymentPayload = {
  invoice_payment: {
    reference?: string
    invoice_id: number | string
    account_id: number
    date: string
    amount: number | string
    payment_method?: string
  }
}

// Generic typed request. Re-thrown errors include the response body so the
// caller can surface Qoyod's validation messages verbatim (e.g. "product_id
// is required", "contact_id not found").
async function request<T = any>(
  apiKey: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'API-KEY': apiKey,
      'Accept': 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed: any = null
  try { parsed = text ? JSON.parse(text) : null } catch { /* binary or empty */ }
  if (!res.ok) {
    const detail = (parsed && (parsed.error || parsed.errors || parsed.message)) || text.slice(0, 300)
    throw new Error(`Qoyod ${res.status} ${method} ${path}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
  }
  return parsed as T
}

// ---- ACCOUNTS (chart of accounts — used for the "settings → pick payment
//      account" picker)
export async function listAccounts(apiKey: string) {
  return request<{ accounts: Array<{ id: number; name: string; account_type?: string; code?: string }> }>(apiKey, 'GET', '/accounts')
}

// ---- INVENTORIES (branches / locations — used for the same picker)
export async function listInventories(apiKey: string) {
  return request<{ inventories: Array<{ id: number; name: string }> }>(apiKey, 'GET', '/inventories')
}

// ---- CUSTOMERS
export async function createCustomer(apiKey: string, payload: QoyodCustomerPayload) {
  return request<{ customer: { id: number; name: string } }>(apiKey, 'POST', '/customers', payload)
}

export async function listCustomers(apiKey: string, search?: string) {
  const qp = search ? `?q[name_cont]=${encodeURIComponent(search)}` : ''
  return request<{ customers: Array<{ id: number; name: string; vat_number?: string; email?: string }> }>(apiKey, 'GET', `/customers${qp}`)
}

// ---- PRODUCTS
export async function createProduct(apiKey: string, payload: QoyodProductPayload) {
  return request<{ product: { id: number; name_en?: string; name_ar?: string } }>(apiKey, 'POST', '/products', payload)
}

// ---- INVOICES
export async function createInvoice(apiKey: string, payload: QoyodInvoicePayload) {
  return request<{ invoice: { id: number; reference: string; total: string } }>(apiKey, 'POST', '/invoices', payload)
}

export async function getInvoice(apiKey: string, id: number) {
  return request<{ invoice: any }>(apiKey, 'GET', `/invoices/${id}`)
}

// ---- INVOICE PAYMENTS
export async function createInvoicePayment(apiKey: string, payload: QoyodPaymentPayload) {
  return request<{ invoice_payment: { id: number } }>(apiKey, 'POST', '/invoice_payments', payload)
}

// ---- Connectivity check used by the Settings page "Test connection" button.
// Returns the account list as a side-effect-free probe — a 200 means the
// key is valid AND scoped to the right org. A 401/403 means the key is
// bad or revoked.
export async function ping(apiKey: string): Promise<{ ok: true; accounts: number } | { ok: false; error: string }> {
  try {
    const r = await listAccounts(apiKey)
    return { ok: true, accounts: r.accounts?.length ?? 0 }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'unknown error' }
  }
}

// Normalize a line-item description for fingerprinting (used by the
// caller's qoyod_products cache lookup so similar lines reuse one
// Qoyod product).
export function fingerprintDescription(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim()
    .slice(0, 200)
}
