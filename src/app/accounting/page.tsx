import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Receipt, CheckCircle2, Send, AlertTriangle, ExternalLink, Eye, Clock } from 'lucide-react'
import { InvoiceActions } from './InvoiceActions'

export const revalidate = 30

const T = {
  en: {
    pageTitle: 'Accounting & VAT Invoices',
    pageSub: 'Drafts created from payment receipts forwarded to the WhatsApp agent. Review and approve, then push to your accounting system.',
    drafts: 'Drafts',
    approved: 'Approved',
    pushed: 'Pushed',
    failed: 'Failed',
    total: 'Total',
    colInvoice: 'Invoice #',
    colCustomer: 'Customer',
    colTotal: 'Total',
    colVat: 'VAT',
    colStatus: 'Status',
    colReceipt: 'Receipt',
    colActions: 'Actions',
    open: 'Open',
    receipt: 'Receipt',
    empty: 'No invoices yet',
    emptyHint: 'Forward a payment receipt PDF to the WhatsApp agent. The agent extracts the data, looks up the related quotation, and creates a draft invoice here for your review.',
    filterAll: 'All',
    statusDraft: 'Draft',
    statusApproved: 'Approved',
    statusPushed: 'Pushed',
    statusFailed: 'Failed',
    statusVoid: 'Void',
  },
  ar: {
    pageTitle: 'المحاسبة وفواتير الضريبة',
    pageSub: 'مسودات تُنشأ من إيصالات الدفع المُرسلة إلى وكيل واتساب. راجع واعتمد، ثم أرسل إلى نظام المحاسبة.',
    drafts: 'مسودات',
    approved: 'معتمدة',
    pushed: 'مُرسلة',
    failed: 'فاشلة',
    total: 'الإجمالي',
    colInvoice: '# الفاتورة',
    colCustomer: 'العميل',
    colTotal: 'الإجمالي',
    colVat: 'الضريبة',
    colStatus: 'الحالة',
    colReceipt: 'الإيصال',
    colActions: 'إجراءات',
    open: 'فتح',
    receipt: 'إيصال',
    empty: 'لا توجد فواتير بعد',
    emptyHint: 'أعد توجيه إيصال دفع PDF إلى وكيل واتساب. سيستخرج الوكيل البيانات ويبحث عن العرض المرتبط وينشئ مسودة فاتورة هنا لمراجعتها.',
    filterAll: 'الكل',
    statusDraft: 'مسودة',
    statusApproved: 'معتمدة',
    statusPushed: 'مُرسلة',
    statusFailed: 'فاشلة',
    statusVoid: 'ملغاة',
  },
} as const

const statusBadge: Record<string, string> = {
  draft:    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  pushed:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  failed:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  void:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const isRtl = locale === 'ar'

  const { data: invoices } = await (supabaseClient as any)
    .from('accounting_invoices')
    .select('id, invoice_number, customer_name, total, vat_amount, currency, status, receipt_url, external_url, push_error, issue_date, payment_date, created_at')
    .neq('status', 'void')
    .order('created_at', { ascending: false })

  const all = (invoices as any[]) ?? []
  const filtered = status && status !== 'all' ? all.filter((i: any) => i.status === status) : all

  const counts = {
    draft:    all.filter((i: any) => i.status === 'draft').length,
    approved: all.filter((i: any) => i.status === 'approved').length,
    pushed:   all.filter((i: any) => i.status === 'pushed').length,
    failed:   all.filter((i: any) => i.status === 'failed').length,
  }
  const totalValue = all.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0)

  const statusLabel: Record<string, string> = {
    draft: t.statusDraft, approved: t.statusApproved, pushed: t.statusPushed,
    failed: t.statusFailed, void: t.statusVoid,
  }
  const filters: { key: string; label: string; count?: number }[] = [
    { key: 'all',      label: t.filterAll, count: all.length },
    { key: 'draft',    label: t.statusDraft, count: counts.draft },
    { key: 'approved', label: t.statusApproved, count: counts.approved },
    { key: 'pushed',   label: t.statusPushed, count: counts.pushed },
    { key: 'failed',   label: t.statusFailed, count: counts.failed },
  ]

  return (
    <div className="space-y-6 pb-10" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
          <Receipt className="h-7 w-7 text-indigo-500" /> {t.pageTitle}
        </h1>
        <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t.drafts,   value: counts.draft,    color: 'border-l-amber-500',   icon: Clock },
          { label: t.approved, value: counts.approved, color: 'border-l-blue-500',    icon: CheckCircle2 },
          { label: t.pushed,   value: counts.pushed,   color: 'border-l-emerald-500', icon: Send },
          { label: t.total,    value: `${totalValue.toLocaleString('en-US')} SAR`, color: 'border-l-indigo-500', icon: Receipt },
        ].map((kpi, i) => (
          <div key={i} className={`premium-card p-4 border-l-4 ${kpi.color} flex items-center gap-4`}>
            <kpi.icon className="h-8 w-8 text-[hsl(var(--muted-foreground))] opacity-40 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-2xl font-black">{kpi.value}</p>
              <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* FILTER PILLS */}
      <div className="premium-card p-4 flex gap-1.5 flex-wrap">
        {filters.map((f) => {
          const active = (status || 'all') === f.key
          return (
            <Link key={f.key} href={f.key === 'all' ? '/accounting' : `/accounting?status=${f.key}`}>
              <button className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${active ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))] shadow-sm' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'}`}>
                {f.label} {typeof f.count === 'number' ? `(${f.count})` : ''}
              </button>
            </Link>
          )
        })}
      </div>

      {/* INVOICE TABLE */}
      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colInvoice}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colCustomer}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colTotal}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colVat}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colStatus}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colReceipt}</th>
                <th className={isRtl ? 'text-left' : 'text-right'}>{t.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <Receipt className="h-12 w-12 mx-auto mb-3 opacity-15" />
                    <p className="text-[hsl(var(--muted-foreground))] font-medium">{t.empty}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 max-w-md mx-auto">{t.emptyHint}</p>
                  </td>
                </tr>
              )}
              {filtered.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
                  <td>
                    <Link href={`/accounting/${inv.id}`} className="font-bold text-[hsl(var(--primary))] hover:underline">
                      {inv.invoice_number}
                    </Link>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{inv.issue_date}</p>
                  </td>
                  <td>
                    <p className="font-semibold text-sm">{inv.customer_name || '—'}</p>
                  </td>
                  <td className="font-bold">{Number(inv.total ?? 0).toLocaleString('en-US')} {inv.currency || 'SAR'}</td>
                  <td className="text-xs text-[hsl(var(--muted-foreground))]">{Number(inv.vat_amount ?? 0).toLocaleString('en-US')}</td>
                  <td>
                    <span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusBadge[inv.status] || statusBadge.draft}`}>
                      {statusLabel[inv.status] ?? inv.status}
                    </span>
                    {inv.push_error && (
                      <p className="text-[10px] text-red-600 mt-1 max-w-[200px] truncate" title={inv.push_error}>
                        <AlertTriangle className="inline h-3 w-3 mr-0.5" />{inv.push_error}
                      </p>
                    )}
                  </td>
                  <td>
                    {inv.receipt_url ? (
                      <a href={inv.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <ExternalLink className="h-3 w-3" /> {t.receipt}
                      </a>
                    ) : (
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))]">—</span>
                    )}
                  </td>
                  <td className={isRtl ? 'text-left' : 'text-right'}>
                    <div className={`inline-flex items-center gap-1.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
                      <Link href={`/accounting/${inv.id}`} className="btn btn-ghost btn-xs">
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                      <InvoiceActions
                        invoiceId={inv.id}
                        status={inv.status}
                        externalUrl={inv.external_url}
                        ar={isRtl}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
