import { NextResponse, type NextRequest } from 'next/server'
import { supabaseClient } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/server'

// Admin-only CSV export of the VAT return for a given date range.
// The page at /accounting/vat-return links here. The CSV is structured
// in three blocks (sales, purchases, summary) so it can be uploaded to
// ZATCA or cross-checked against the Qoyod filing.
//
// UTF-8 BOM is prepended so Excel/Numbers on Windows render the Arabic
// columns + Arabic vendor names correctly. CRLF line endings keep
// Excel happy.

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function n2(v: unknown): string {
  const num = Number(v ?? 0)
  if (!Number.isFinite(num)) return '0.00'
  return num.toFixed(2)
}

function quarterLabel(from: string, to: string): string {
  // If the range matches a standard calendar quarter, label it Q1..Q4.
  const f = new Date(from + 'T00:00:00Z')
  const t = new Date(to + 'T00:00:00Z')
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return ''
  const fm = f.getUTCMonth()
  const tm = t.getUTCMonth()
  const fy = f.getUTCFullYear()
  const ty = t.getUTCFullYear()
  if (fy !== ty) return ''
  const isQ = (qStartMonth: number) =>
    fm === qStartMonth && tm === qStartMonth + 2 && f.getUTCDate() === 1
  if (isQ(0)) return `Q1-${fy}`
  if (isQ(3)) return `Q2-${fy}`
  if (isQ(6)) return `Q3-${fy}`
  if (isQ(9)) return `Q4-${fy}`
  return ''
}

export async function GET(request: NextRequest) {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') {
    return NextResponse.json({ error: 'admin only' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 })
  }

  // Invoices (AR) — status enum has no 'paid'; that's a bills-only state.
  // Bills (AP) — 'paid' is a real status, include it.
  const [invRes, billRes] = await Promise.all([
    (supabaseClient as any).from('accounting_invoices')
      .select('invoice_number, customer_name, customer_vat, issue_date, subtotal, vat_amount, total, currency, status, payment_date, external_id, external_system')
      .gte('issue_date', from).lte('issue_date', to)
      .in('status', ['approved', 'pushed'])
      .order('issue_date'),
    (supabaseClient as any).from('accounting_bills')
      .select('bill_reference, vendor_name, vendor_vat, issue_date, subtotal, vat_amount, total, currency, status, category, payment_date, external_id, external_system')
      .gte('issue_date', from).lte('issue_date', to)
      .in('status', ['approved', 'pushed', 'paid'])
      .order('issue_date'),
  ])

  if (invRes.error) {
    return NextResponse.json({ error: invRes.error.message }, { status: 500 })
  }
  if (billRes.error) {
    return NextResponse.json({ error: billRes.error.message }, { status: 500 })
  }

  const invoices = (invRes.data as any[]) ?? []
  const bills = (billRes.data as any[]) ?? []

  const outputVat = invoices.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0)
  const inputVat = bills.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0)
  const salesSubtotal = invoices.reduce((s, r) => s + Number(r.subtotal ?? 0), 0)
  const salesTotal = invoices.reduce((s, r) => s + Number(r.total ?? 0), 0)
  const purchasesSubtotal = bills.reduce((s, r) => s + Number(r.subtotal ?? 0), 0)
  const purchasesTotal = bills.reduce((s, r) => s + Number(r.total ?? 0), 0)
  const net = Math.round((outputVat - inputVat) * 100) / 100

  const lines: string[] = []

  // Header block — bilingual labels so the file is self-describing in
  // both languages. ZATCA filings are in Arabic; cross-checks with the
  // English Qoyod export need the English row too.
  lines.push(['VAT Return / إقرار ضريبة القيمة المضافة'].map(csvCell).join(','))
  lines.push(['Period / الفترة', `${from}  →  ${to}`].map(csvCell).join(','))
  const ql = quarterLabel(from, to)
  if (ql) {
    lines.push(['Quarter / الربع', ql].map(csvCell).join(','))
  }
  lines.push(['Generated at / تاريخ التوليد', new Date().toISOString()].map(csvCell).join(','))
  lines.push('')

  // ---- Sales block (output VAT) ----
  lines.push(['SALES — OUTPUT VAT / المبيعات — الضريبة المستحقة'].map(csvCell).join(','))
  lines.push([
    'Date / التاريخ',
    'Invoice # / رقم الفاتورة',
    'Customer / العميل',
    'Customer VAT # / الرقم الضريبي',
    'Subtotal / المجموع قبل الضريبة',
    'VAT / الضريبة',
    'Total / الإجمالي',
    'Currency / العملة',
    'Status / الحالة',
    'Payment date / تاريخ السداد',
    'Qoyod ID / معرف قيود',
  ].map(csvCell).join(','))
  for (const r of invoices) {
    lines.push([
      r.issue_date,
      r.invoice_number,
      r.customer_name ?? '',
      r.customer_vat ?? '',
      n2(r.subtotal),
      n2(r.vat_amount),
      n2(r.total),
      r.currency ?? 'SAR',
      r.status,
      r.payment_date ?? '',
      r.external_system === 'qoyod' ? (r.external_id ?? '') : '',
    ].map(csvCell).join(','))
  }
  lines.push([
    'TOTAL / الإجمالي', '', '', '',
    n2(salesSubtotal),
    n2(outputVat),
    n2(salesTotal),
  ].map(csvCell).join(','))
  lines.push('')

  // ---- Purchases block (input VAT) ----
  lines.push(['PURCHASES — INPUT VAT / المشتريات — الضريبة المسددة'].map(csvCell).join(','))
  lines.push([
    'Date / التاريخ',
    'Bill ref / مرجع الفاتورة',
    'Vendor / المورد',
    'Vendor VAT # / الرقم الضريبي للمورد',
    'Category / التصنيف',
    'Subtotal / المجموع قبل الضريبة',
    'VAT / الضريبة',
    'Total / الإجمالي',
    'Currency / العملة',
    'Status / الحالة',
    'Payment date / تاريخ السداد',
    'Qoyod ID / معرف قيود',
  ].map(csvCell).join(','))
  for (const r of bills) {
    lines.push([
      r.issue_date,
      r.bill_reference,
      r.vendor_name ?? '',
      r.vendor_vat ?? '',
      r.category ?? '',
      n2(r.subtotal),
      n2(r.vat_amount),
      n2(r.total),
      r.currency ?? 'SAR',
      r.status,
      r.payment_date ?? '',
      r.external_system === 'qoyod' ? (r.external_id ?? '') : '',
    ].map(csvCell).join(','))
  }
  lines.push([
    'TOTAL / الإجمالي', '', '', '', '',
    n2(purchasesSubtotal),
    n2(inputVat),
    n2(purchasesTotal),
  ].map(csvCell).join(','))
  lines.push('')

  // ---- Summary block ----
  lines.push(['SUMMARY / الملخص'].map(csvCell).join(','))
  lines.push(['Output VAT (sales) / الضريبة المستحقة', n2(outputVat)].map(csvCell).join(','))
  lines.push(['Input VAT (purchases) / الضريبة المسددة', n2(inputVat)].map(csvCell).join(','))
  if (net >= 0) {
    lines.push(['Net VAT owed to ZATCA / صافي الضريبة المستحقة لزاتكا', n2(net)].map(csvCell).join(','))
  } else {
    lines.push(['Net VAT refund from ZATCA / صافي الضريبة المسترَدّة من زاتكا', n2(Math.abs(net))].map(csvCell).join(','))
  }
  lines.push(['Invoices included / عدد فواتير المبيعات', String(invoices.length)].map(csvCell).join(','))
  lines.push(['Bills included / عدد فواتير المشتريات', String(bills.length)].map(csvCell).join(','))

  // Excel on Windows reads cp1252 unless the BOM is present at byte 0.
  // CRLF line endings — LF-only renders as one giant row in some Excel
  // versions.
  const csv = '﻿' + lines.join('\r\n')
  const filename = ql ? `vat-return-${ql}.csv` : `vat-return-${from}_to_${to}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
