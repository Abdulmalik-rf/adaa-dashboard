import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Wallet, CheckCircle2, Send, ExternalLink, Eye, Clock, AlertTriangle } from 'lucide-react'
import { BillActions } from './BillActions'

export const revalidate = 30

const T = {
  en: {
    pageTitle: 'Bills & Expenses',
    pageSub: 'Drafts created from expense receipts and vendor invoices forwarded to the WhatsApp agent. Review, approve, push to Qoyod.',
    backToInvoices: '← View invoices instead',
    drafts: 'Drafts', approved: 'Approved', pushed: 'Pushed', paid: 'Paid', failed: 'Failed', total: 'Total Outflow',
    filterAll: 'All',
    colRef: 'Bill #', colVendor: 'Vendor', colCategory: 'Category', colTotal: 'Total', colVat: 'VAT',
    colStatus: 'Status', colReceipt: 'Receipt', colActions: 'Actions',
    empty: 'No bills yet',
    emptyHint: 'Forward an expense receipt or vendor invoice PDF to the WhatsApp agent. AI extracts the data, suggests a category, and creates a draft bill here.',
    receipt: 'Receipt',
    statusDraft: 'Draft', statusApproved: 'Approved', statusPushed: 'Pushed', statusPaid: 'Paid', statusFailed: 'Failed', statusVoid: 'Void',
  },
  ar: {
    pageTitle: 'الفواتير والمصاريف',
    pageSub: 'مسودات تُنشأ من إيصالات المصاريف وفواتير الموردين المرسلة إلى وكيل واتساب. راجع، اعتمد، أرسل إلى قيود.',
    backToInvoices: '← عرض فواتير المبيعات بدلاً',
    drafts: 'مسودات', approved: 'معتمدة', pushed: 'مُرسلة', paid: 'مدفوعة', failed: 'فاشلة', total: 'إجمالي المصاريف',
    filterAll: 'الكل',
    colRef: '# الفاتورة', colVendor: 'المورد', colCategory: 'التصنيف', colTotal: 'الإجمالي', colVat: 'الضريبة',
    colStatus: 'الحالة', colReceipt: 'الإيصال', colActions: 'إجراءات',
    empty: 'لا توجد فواتير بعد',
    emptyHint: 'أعد توجيه إيصال مصاريف أو فاتورة مورد PDF إلى وكيل واتساب. سيستخرج الذكاء الاصطناعي البيانات ويقترح تصنيفاً وينشئ مسودة هنا.',
    receipt: 'إيصال',
    statusDraft: 'مسودة', statusApproved: 'معتمدة', statusPushed: 'مُرسلة', statusPaid: 'مدفوعة', statusFailed: 'فاشلة', statusVoid: 'ملغاة',
  },
} as const

const statusBadge: Record<string, string> = {
  draft:    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  pushed:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  paid:     'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  failed:   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  void:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>
}) {
  const { status, category } = await searchParams
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const isRtl = locale === 'ar'

  const { data: bills } = await (supabaseClient as any)
    .from('accounting_bills')
    .select('id, bill_reference, vendor_name, category, total, vat_amount, currency, status, receipt_url, external_url, push_error, issue_date, payment_date, is_simple, created_at')
    .neq('status', 'void')
    .order('created_at', { ascending: false })

  const all = (bills as any[]) ?? []
  let filtered = all
  if (status && status !== 'all') filtered = filtered.filter((b: any) => b.status === status)
  if (category) filtered = filtered.filter((b: any) => b.category === category)

  const counts = {
    draft: all.filter((b: any) => b.status === 'draft').length,
    approved: all.filter((b: any) => b.status === 'approved').length,
    pushed: all.filter((b: any) => b.status === 'pushed').length,
    paid: all.filter((b: any) => b.status === 'paid').length,
  }
  const totalOutflow = all.reduce((s: number, b: any) => s + Number(b.total ?? 0), 0)
  const distinctCats = Array.from(new Set(all.map((b: any) => b.category).filter(Boolean)))

  const statusLabel: Record<string, string> = {
    draft: t.statusDraft, approved: t.statusApproved, pushed: t.statusPushed,
    paid: t.statusPaid, failed: t.statusFailed, void: t.statusVoid,
  }
  const filters = [
    { key: 'all', label: t.filterAll },
    { key: 'draft', label: t.statusDraft },
    { key: 'approved', label: t.statusApproved },
    { key: 'pushed', label: t.statusPushed },
    { key: 'paid', label: t.statusPaid },
    { key: 'failed', label: t.statusFailed },
  ]

  return (
    <div className="space-y-6 pb-10" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Wallet className="h-7 w-7 text-red-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/accounting" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
          {t.backToInvoices}
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: t.drafts, value: counts.draft, color: 'border-l-amber-500', icon: Clock },
          { label: t.approved, value: counts.approved, color: 'border-l-blue-500', icon: CheckCircle2 },
          { label: t.pushed, value: counts.pushed, color: 'border-l-emerald-500', icon: Send },
          { label: t.paid, value: counts.paid, color: 'border-l-purple-500', icon: CheckCircle2 },
          { label: t.total, value: `${totalOutflow.toLocaleString('en-US')} SAR`, color: 'border-l-red-500', icon: Wallet },
        ].map((kpi, i) => (
          <div key={i} className={`premium-card p-4 border-l-4 ${kpi.color} flex items-center gap-3`}>
            <kpi.icon className="h-7 w-7 text-[hsl(var(--muted-foreground))] opacity-40 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xl font-black truncate">{kpi.value}</p>
              <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="premium-card p-4 flex gap-1.5 flex-wrap">
        {filters.map((f) => {
          const active = (status || 'all') === f.key
          return (
            <Link key={f.key} href={f.key === 'all' ? '/accounting/bills' : `/accounting/bills?status=${f.key}`}>
              <button className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${active ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))] shadow-sm' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'}`}>
                {f.label}
              </button>
            </Link>
          )
        })}
        {distinctCats.length > 0 && (
          <>
            <span className="mx-2 text-[hsl(var(--muted-foreground))]">·</span>
            {distinctCats.slice(0, 10).map((c: string) => (
              <Link key={c} href={`/accounting/bills?category=${encodeURIComponent(c)}`}>
                <button className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${category === c ? 'bg-indigo-500 text-white border-indigo-500' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-indigo-500 hover:text-indigo-600'}`}>
                  {c}
                </button>
              </Link>
            ))}
          </>
        )}
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colRef}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colVendor}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colCategory}</th>
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
                  <td colSpan={8} className="py-20 text-center">
                    <Wallet className="h-12 w-12 mx-auto mb-3 opacity-15" />
                    <p className="text-[hsl(var(--muted-foreground))] font-medium">{t.empty}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 max-w-md mx-auto">{t.emptyHint}</p>
                  </td>
                </tr>
              )}
              {filtered.map((b: any) => (
                <tr key={b.id} className="hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
                  <td>
                    <Link href={`/accounting/bills/${b.id}`} className="font-bold text-[hsl(var(--primary))] hover:underline">
                      {b.bill_reference}
                    </Link>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{b.issue_date}{b.is_simple ? ' · simple' : ''}</p>
                  </td>
                  <td><p className="font-semibold text-sm">{b.vendor_name || '—'}</p></td>
                  <td>
                    {b.category ? (
                      <span className="badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
                        {b.category}
                      </span>
                    ) : <span className="text-[10px] text-[hsl(var(--muted-foreground))] italic">—</span>}
                  </td>
                  <td className="font-bold">{Number(b.total ?? 0).toLocaleString('en-US')} {b.currency || 'SAR'}</td>
                  <td className="text-xs text-[hsl(var(--muted-foreground))]">{Number(b.vat_amount ?? 0).toLocaleString('en-US')}</td>
                  <td>
                    <span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusBadge[b.status] || statusBadge.draft}`}>
                      {statusLabel[b.status] ?? b.status}
                    </span>
                    {b.push_error && (
                      <p className="text-[10px] text-red-600 mt-1 max-w-[200px] truncate" title={b.push_error}>
                        <AlertTriangle className="inline h-3 w-3 mr-0.5" />{b.push_error}
                      </p>
                    )}
                  </td>
                  <td>
                    {b.receipt_url ? (
                      <a href={b.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <ExternalLink className="h-3 w-3" /> {t.receipt}
                      </a>
                    ) : (<span className="text-[10px] text-[hsl(var(--muted-foreground))]">—</span>)}
                  </td>
                  <td className={isRtl ? 'text-left' : 'text-right'}>
                    <div className={`inline-flex items-center gap-1.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
                      <Link href={`/accounting/bills/${b.id}`} className="btn btn-ghost btn-xs">
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                      <BillActions billId={b.id} status={b.status} externalUrl={b.external_url} ar={isRtl} />
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
