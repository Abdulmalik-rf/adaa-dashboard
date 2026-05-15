import { supabaseClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { ArrowLeft, ExternalLink, Wallet, AlertTriangle, Tag, Calendar } from 'lucide-react'
import { BillActions } from '../BillActions'
import { BillEditor } from './BillEditor'
import { BillMetaEditor } from './BillMetaEditor'

export const revalidate = 0

// Reused across the page — the bills.ts status enum is wider than
// invoices (paid is a real terminal state for AP, distinct from pushed
// for AR — Qoyod uses a separate /bill_payments call).
const statusBadge: Record<string, string> = {
  draft:    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  pushed:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  paid:     'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  failed:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  void:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const ar = locale === 'ar'

  const { data: bill, error } = await (supabaseClient as any)
    .from('accounting_bills')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !bill) return notFound()

  // Pull category-mapping hit-count so we can hint "you usually classify
  // this vendor as X" when admin is editing the category.
  let categoryHint: { category: string; hit_count: number } | null = null
  if (bill.vendor_name) {
    const fp = String(bill.vendor_name)
      .toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .trim()
      .slice(0, 120)
    if (fp) {
      const { data: m } = await (supabaseClient as any)
        .from('expense_category_mappings')
        .select('category, hit_count')
        .eq('vendor_fingerprint', fp)
        .maybeSingle()
      if (m) categoryHint = m as any
    }
  }

  const t = ar
    ? {
        backToBills: '← العودة إلى الفواتير',
        vendor: 'المورد',
        vat: 'الرقم الضريبي',
        cr: 'السجل التجاري',
        category: 'التصنيف',
        usuallyClassified: 'تصنّف عادةً كـ',
        payment: 'الدفع',
        method: 'الطريقة',
        reference: 'المرجع',
        billNumber: 'رقم فاتورة المورد',
        dueDate: 'تاريخ الاستحقاق',
        paymentDate: 'تاريخ السداد',
        receipt: 'فتح إيصال/فاتورة المورد',
        pushFailed: 'فشل الإرسال إلى المحاسبة',
        subtotal: 'المجموع الفرعي',
        vatLine: 'ضريبة القيمة المضافة',
        total: 'الإجمالي',
        notes: 'ملاحظات',
        statusDraft: 'مسودة', statusApproved: 'معتمدة', statusPushed: 'مُرسلة',
        statusPaid: 'مدفوعة', statusFailed: 'فاشلة', statusVoid: 'ملغاة',
        issuedOn: 'تاريخ الفاتورة',
        simpleTag: 'فاتورة بسيطة',
      }
    : {
        backToBills: '← Back to bills',
        vendor: 'Vendor',
        vat: 'VAT',
        cr: 'CR',
        category: 'Category',
        usuallyClassified: 'usually categorized as',
        payment: 'Payment',
        method: 'Method',
        reference: 'Reference',
        billNumber: "Vendor's bill #",
        dueDate: 'Due date',
        paymentDate: 'Payment date',
        receipt: 'Open vendor receipt / invoice',
        pushFailed: 'Push to accounting system failed',
        subtotal: 'Subtotal',
        vatLine: 'VAT',
        total: 'Total',
        notes: 'Notes',
        statusDraft: 'Draft', statusApproved: 'Approved', statusPushed: 'Pushed',
        statusPaid: 'Paid', statusFailed: 'Failed', statusVoid: 'Void',
        issuedOn: 'Issued',
        simpleTag: 'Simple bill',
      }
  const statusLabel: Record<string, string> = {
    draft: t.statusDraft, approved: t.statusApproved, pushed: t.statusPushed,
    paid: t.statusPaid, failed: t.statusFailed, void: t.statusVoid,
  }

  return (
    <div className="space-y-6 pb-10 max-w-4xl mx-auto" dir={ar ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/accounting/bills" className="btn btn-ghost btn-icon">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Wallet className="h-6 w-6 text-red-500" />
              {bill.bill_reference}
              {bill.is_simple && (
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                  {t.simpleTag}
                </span>
              )}
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {t.issuedOn}: {bill.issue_date}
              {bill.payment_date ? ` · ${t.paymentDate}: ${bill.payment_date}` : ''}
              <span className={`mx-2 badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusBadge[bill.status] || statusBadge.draft}`}>
                {statusLabel[bill.status] ?? bill.status}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BillActions billId={bill.id} status={bill.status} externalUrl={bill.external_url} ar={ar} />
        </div>
      </div>

      {bill.push_error && (
        <div className="premium-card p-4 border-l-4 border-l-red-500 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm text-red-700 dark:text-red-400">{t.pushFailed}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 break-words">{bill.push_error}</p>
          </div>
        </div>
      )}

      {/* Vendor + payment + category metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="premium-card p-5">
          <h3 className="font-bold text-sm mb-3 uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {t.vendor}
          </h3>
          <p className="font-bold text-lg">{bill.vendor_name || '—'}</p>
          {bill.vendor_vat && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t.vat}: {bill.vendor_vat}</p>}
          {bill.vendor_cr && <p className="text-xs text-[hsl(var(--muted-foreground))]">{t.cr}: {bill.vendor_cr}</p>}
          {bill.vendor_address && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">{bill.vendor_address}</p>}
          {bill.bill_number && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
              <span className="font-semibold">{t.billNumber}:</span> {bill.bill_number}
            </p>
          )}
        </div>
        <div className="premium-card p-5">
          <h3 className="font-bold text-sm mb-3 uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {t.payment}
          </h3>
          <p className="text-sm"><span className="font-semibold">{t.method}:</span> {bill.payment_method || '—'}</p>
          <p className="text-sm mt-1"><span className="font-semibold">{t.reference}:</span> {bill.payment_reference || '—'}</p>
          {bill.due_date && (
            <p className="text-sm mt-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span className="font-semibold">{t.dueDate}:</span> {bill.due_date}
            </p>
          )}
          {bill.receipt_url && (
            <a href={bill.receipt_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
              <ExternalLink className="h-3 w-3" /> {t.receipt}
            </a>
          )}
        </div>
      </div>

      {/* Category + vendor-meta editor (draft-only) */}
      <BillMetaEditor bill={bill} categoryHint={categoryHint} ar={ar} t={{
        category: t.category,
        usuallyClassified: t.usuallyClassified,
        billNumber: t.billNumber,
        dueDate: t.dueDate,
        paymentDate: t.paymentDate,
      }} />

      {/* Line items — editable when status='draft' */}
      <BillEditor bill={bill} ar={ar} />

      {/* Totals */}
      <div className="premium-card p-5 max-w-md ml-auto">
        <div className="flex justify-between text-sm py-1">
          <span className="text-[hsl(var(--muted-foreground))]">{t.subtotal}</span>
          <span className="font-semibold">{Number(bill.subtotal ?? 0).toLocaleString('en-US')} {bill.currency || 'SAR'}</span>
        </div>
        <div className="flex justify-between text-sm py-1">
          <span className="text-[hsl(var(--muted-foreground))]">
            {t.vatLine} ({Number(bill.vat_rate ?? 15)}%)
          </span>
          <span className="font-semibold">{Number(bill.vat_amount ?? 0).toLocaleString('en-US')} {bill.currency || 'SAR'}</span>
        </div>
        <div className="border-t border-[hsl(var(--border))] mt-2 pt-2 flex justify-between text-base font-black">
          <span>{t.total}</span>
          <span className="text-[hsl(var(--primary))]">{Number(bill.total ?? 0).toLocaleString('en-US')} {bill.currency || 'SAR'}</span>
        </div>
      </div>

      {bill.notes && (
        <div className="premium-card p-5">
          <h3 className="font-bold text-sm mb-2 uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{t.notes}</h3>
          <p className="text-sm text-[hsl(var(--foreground))] whitespace-pre-wrap">{bill.notes}</p>
        </div>
      )}
    </div>
  )
}
