import { supabaseClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { ArrowLeft, ExternalLink, Receipt, AlertTriangle } from 'lucide-react'
import { InvoiceActions } from '../InvoiceActions'
import { InvoiceEditor } from './InvoiceEditor'

export const revalidate = 0

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const ar = locale === 'ar'

  const { data: inv, error } = await (supabaseClient as any)
    .from('accounting_invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !inv) return notFound()

  return (
    <div className="space-y-6 pb-10 max-w-4xl mx-auto" dir={ar ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/accounting" className="btn btn-ghost btn-icon">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Receipt className="h-6 w-6 text-indigo-500" />
              {inv.invoice_number}
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {ar ? 'تاريخ الإصدار' : 'Issued'}: {inv.issue_date}
              {inv.payment_date ? ` · ${ar ? 'تاريخ الدفع' : 'Paid'}: ${inv.payment_date}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <InvoiceActions
            invoiceId={inv.id}
            status={inv.status}
            externalUrl={inv.external_url}
            ar={ar}
          />
        </div>
      </div>

      {inv.push_error && (
        <div className="premium-card p-4 border-l-4 border-l-red-500 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm text-red-700 dark:text-red-400">
              {ar ? 'فشل الإرسال للمحاسبة' : 'Push to accounting system failed'}
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 break-words">{inv.push_error}</p>
          </div>
        </div>
      )}

      {/* Customer + payment metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="premium-card p-5">
          <h3 className="font-bold text-sm mb-3 uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {ar ? 'العميل' : 'Customer'}
          </h3>
          <p className="font-bold text-lg">{inv.customer_name || '—'}</p>
          {inv.customer_vat && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{ar ? 'الرقم الضريبي' : 'VAT'}: {inv.customer_vat}</p>}
          {inv.customer_cr && <p className="text-xs text-[hsl(var(--muted-foreground))]">{ar ? 'السجل التجاري' : 'CR'}: {inv.customer_cr}</p>}
          {inv.customer_address && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">{inv.customer_address}</p>}
        </div>
        <div className="premium-card p-5">
          <h3 className="font-bold text-sm mb-3 uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {ar ? 'الدفع' : 'Payment'}
          </h3>
          <p className="text-sm"><span className="font-semibold">{ar ? 'الطريقة' : 'Method'}:</span> {inv.payment_method || '—'}</p>
          <p className="text-sm mt-1"><span className="font-semibold">{ar ? 'المرجع' : 'Reference'}:</span> {inv.payment_reference || '—'}</p>
          {inv.receipt_url && (
            <a href={inv.receipt_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
              <ExternalLink className="h-3 w-3" /> {ar ? 'فتح إيصال الدفع' : 'Open payment receipt'}
            </a>
          )}
        </div>
      </div>

      {/* Line items — editable when status='draft' */}
      <InvoiceEditor invoice={inv} ar={ar} />

      {/* Totals */}
      <div className="premium-card p-5 max-w-md ml-auto">
        <div className="flex justify-between text-sm py-1">
          <span className="text-[hsl(var(--muted-foreground))]">{ar ? 'المجموع الفرعي' : 'Subtotal'}</span>
          <span className="font-semibold">{Number(inv.subtotal ?? 0).toLocaleString('en-US')} {inv.currency || 'SAR'}</span>
        </div>
        <div className="flex justify-between text-sm py-1">
          <span className="text-[hsl(var(--muted-foreground))]">
            {ar ? 'ضريبة القيمة المضافة' : 'VAT'} ({Number(inv.vat_rate ?? 15)}%)
          </span>
          <span className="font-semibold">{Number(inv.vat_amount ?? 0).toLocaleString('en-US')} {inv.currency || 'SAR'}</span>
        </div>
        <div className="border-t border-[hsl(var(--border))] mt-2 pt-2 flex justify-between text-base font-black">
          <span>{ar ? 'الإجمالي' : 'Total'}</span>
          <span className="text-[hsl(var(--primary))]">{Number(inv.total ?? 0).toLocaleString('en-US')} {inv.currency || 'SAR'}</span>
        </div>
      </div>

      {inv.notes && (
        <div className="premium-card p-5">
          <h3 className="font-bold text-sm mb-2 uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{ar ? 'ملاحظات' : 'Notes'}</h3>
          <p className="text-sm text-[hsl(var(--foreground))] whitespace-pre-wrap">{inv.notes}</p>
        </div>
      )}
    </div>
  )
}
