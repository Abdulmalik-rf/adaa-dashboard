import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { FileText, Download, ArrowLeft, AlertTriangle } from 'lucide-react'

export const revalidate = 0

// Default to current quarter if no date params passed.
function currentQuarter(): { from: string; to: string; label: string } {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const startMonth = q * 3
  const from = new Date(now.getFullYear(), startMonth, 1)
  const to = new Date(now.getFullYear(), startMonth + 3, 0)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    label: `Q${q + 1} ${now.getFullYear()}`,
  }
}

const T = {
  en: {
    pageTitle: 'VAT Return',
    pageSub: 'Quarterly VAT summary compiled from your sales invoices (output VAT collected) and bills (input VAT paid). Download the CSV and upload to ZATCA, or use it to cross-check your Qoyod filing.',
    backLink: '← Back to accounting',
    period: 'Period',
    from: 'From',
    to: 'To',
    apply: 'Apply',
    quarterPresets: 'Presets',
    outputVat: 'Output VAT (sales)',
    inputVat: 'Input VAT (purchases)',
    net: 'Net VAT owed',
    netRefund: 'Net VAT refund',
    invoicesIncluded: 'Invoices included',
    billsIncluded: 'Bills included',
    downloadCsv: 'Download CSV',
    salesSection: 'Sales (output VAT)',
    purchasesSection: 'Purchases (input VAT)',
    colDate: 'Date',
    colRef: 'Reference',
    colParty: 'Counterparty',
    colSubtotal: 'Subtotal',
    colVat: 'VAT',
    colTotal: 'Total',
    noSales: 'No sales invoices in this period.',
    noPurchases: 'No bills in this period.',
    warning: 'Drafts and voided records are excluded. Only approved + pushed + paid statuses count toward the VAT return.',
  },
  ar: {
    pageTitle: 'إقرار ضريبة القيمة المضافة',
    pageSub: 'ملخص ربع سنوي مجمَّع من فواتير المبيعات (الضريبة المستحقة) والمشتريات (الضريبة المسددة). نزّل CSV وارفعه على بوابة زاتكا، أو استخدمه للمراجعة المتقاطعة مع قيود.',
    backLink: '← العودة إلى المحاسبة',
    period: 'الفترة',
    from: 'من',
    to: 'إلى',
    apply: 'تطبيق',
    quarterPresets: 'فترات سريعة',
    outputVat: 'ضريبة مستحقة (المبيعات)',
    inputVat: 'ضريبة مسددة (المشتريات)',
    net: 'صافي الضريبة المستحقة',
    netRefund: 'صافي الضريبة المسترَدّة',
    invoicesIncluded: 'فواتير المبيعات',
    billsIncluded: 'فواتير المشتريات',
    downloadCsv: 'تنزيل CSV',
    salesSection: 'المبيعات (الضريبة المستحقة)',
    purchasesSection: 'المشتريات (الضريبة المسددة)',
    colDate: 'التاريخ',
    colRef: 'المرجع',
    colParty: 'الطرف الآخر',
    colSubtotal: 'المجموع قبل الضريبة',
    colVat: 'الضريبة',
    colTotal: 'الإجمالي',
    noSales: 'لا توجد فواتير مبيعات في هذه الفترة.',
    noPurchases: 'لا توجد فواتير مشتريات في هذه الفترة.',
    warning: 'المسودات والملغاة مستثناة. فقط الحالات المعتمدة والمُرسلة والمدفوعة تُحتسب.',
  },
} as const

export default async function VatReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from: qFrom, to: qTo } = await searchParams
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const isRtl = locale === 'ar'

  const defaults = currentQuarter()
  const from = qFrom || defaults.from
  const to = qTo || defaults.to

  const [{ data: invoices }, { data: bills }] = await Promise.all([
    (supabaseClient as any).from('accounting_invoices')
      .select('id, invoice_number, customer_name, issue_date, subtotal, vat_amount, total, currency, status')
      .gte('issue_date', from).lte('issue_date', to)
      .in('status', ['approved', 'pushed'])
      .order('issue_date'),
    (supabaseClient as any).from('accounting_bills')
      .select('id, bill_reference, vendor_name, issue_date, subtotal, vat_amount, total, currency, status, category')
      .gte('issue_date', from).lte('issue_date', to)
      .in('status', ['approved', 'pushed', 'paid'])
      .order('issue_date'),
  ])

  const inv = (invoices as any[]) ?? []
  const bls = (bills as any[]) ?? []
  const outputVat = inv.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0)
  const inputVat = bls.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0)
  const netDue = Math.round((outputVat - inputVat) * 100) / 100
  const isRefund = netDue < 0

  // Quarter presets
  const year = new Date(from + 'T00:00:00Z').getUTCFullYear()
  const quarters = [
    { label: `Q1 ${year}`, from: `${year}-01-01`, to: `${year}-03-31` },
    { label: `Q2 ${year}`, from: `${year}-04-01`, to: `${year}-06-30` },
    { label: `Q3 ${year}`, from: `${year}-07-01`, to: `${year}-09-30` },
    { label: `Q4 ${year}`, from: `${year}-10-01`, to: `${year}-12-31` },
  ]

  return (
    <div className="space-y-6 pb-10" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <FileText className="h-7 w-7 text-purple-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/accounting" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
          {t.backLink}
        </Link>
      </div>

      {/* Period picker */}
      <div className="premium-card p-4">
        <form className="flex flex-wrap items-end gap-3" action="/accounting/vat-return" method="GET">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{t.from}</label>
            <input type="date" name="from" defaultValue={from} className="h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{t.to}</label>
            <input type="date" name="to" defaultValue={to} className="h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm" />
          </div>
          <button type="submit" className="btn btn-primary h-9">{t.apply}</button>
          <div className={`flex items-center gap-1.5 flex-wrap ${isRtl ? 'mr-auto' : 'ml-auto'}`}>
            <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{t.quarterPresets}:</span>
            {quarters.map((q) => (
              <Link key={q.label} href={`/accounting/vat-return?from=${q.from}&to=${q.to}`}>
                <button type="button" className={`px-2.5 py-1 rounded-full text-xs font-bold border ${from === q.from && to === q.to ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'}`}>
                  {q.label}
                </button>
              </Link>
            ))}
          </div>
        </form>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="premium-card p-4 border-l-4 border-l-emerald-500">
          <p className="text-2xl font-black">{outputVat.toLocaleString('en-US')} <span className="text-sm">SAR</span></p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mt-1">{t.outputVat}</p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{inv.length} {t.invoicesIncluded}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-red-500">
          <p className="text-2xl font-black">{inputVat.toLocaleString('en-US')} <span className="text-sm">SAR</span></p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mt-1">{t.inputVat}</p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{bls.length} {t.billsIncluded}</p>
        </div>
        <div className={`premium-card p-4 border-l-4 ${isRefund ? 'border-l-blue-500' : 'border-l-amber-500'}`}>
          <p className="text-2xl font-black">{Math.abs(netDue).toLocaleString('en-US')} <span className="text-sm">SAR</span></p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mt-1">
            {isRefund ? t.netRefund : t.net}
          </p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-purple-500 flex items-center justify-center">
          <a href={`/api/accounting/vat-return.csv?from=${from}&to=${to}`} download className="btn btn-primary flex items-center gap-2">
            <Download className="h-4 w-4" /> {t.downloadCsv}
          </a>
        </div>
      </div>

      <div className="premium-card p-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/15 border-l-4 border-l-amber-500">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>{t.warning}</p>
      </div>

      {/* Sales table */}
      <div className="premium-card overflow-hidden">
        <div className="px-5 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
          <h3 className="font-bold text-sm uppercase tracking-wider">{t.salesSection} — {inv.length}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
              <tr>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>{t.colDate}</th>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>{t.colRef}</th>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>{t.colParty}</th>
                <th className="px-3 py-2 text-right">{t.colSubtotal}</th>
                <th className="px-3 py-2 text-right">{t.colVat}</th>
                <th className="px-3 py-2 text-right">{t.colTotal}</th>
              </tr>
            </thead>
            <tbody>
              {inv.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-[hsl(var(--muted-foreground))] italic">{t.noSales}</td></tr>
              )}
              {inv.map((r: any) => (
                <tr key={r.id} className="border-t border-[hsl(var(--border))]">
                  <td className="px-3 py-2 text-xs">{r.issue_date}</td>
                  <td className="px-3 py-2 font-semibold"><Link href={`/accounting/${r.id}`} className="text-[hsl(var(--primary))] hover:underline">{r.invoice_number}</Link></td>
                  <td className="px-3 py-2 text-xs">{r.customer_name || '—'}</td>
                  <td className="px-3 py-2 text-right text-xs">{Number(r.subtotal ?? 0).toLocaleString('en-US')}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold">{Number(r.vat_amount ?? 0).toLocaleString('en-US')}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold">{Number(r.total ?? 0).toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Purchases table */}
      <div className="premium-card overflow-hidden">
        <div className="px-5 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
          <h3 className="font-bold text-sm uppercase tracking-wider">{t.purchasesSection} — {bls.length}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
              <tr>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>{t.colDate}</th>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>{t.colRef}</th>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>{t.colParty}</th>
                <th className="px-3 py-2 text-right">{t.colSubtotal}</th>
                <th className="px-3 py-2 text-right">{t.colVat}</th>
                <th className="px-3 py-2 text-right">{t.colTotal}</th>
              </tr>
            </thead>
            <tbody>
              {bls.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-[hsl(var(--muted-foreground))] italic">{t.noPurchases}</td></tr>
              )}
              {bls.map((r: any) => (
                <tr key={r.id} className="border-t border-[hsl(var(--border))]">
                  <td className="px-3 py-2 text-xs">{r.issue_date}</td>
                  <td className="px-3 py-2 font-semibold"><Link href={`/accounting/bills/${r.id}`} className="text-[hsl(var(--primary))] hover:underline">{r.bill_reference}</Link></td>
                  <td className="px-3 py-2 text-xs">{r.vendor_name || '—'}{r.category ? ` · ${r.category}` : ''}</td>
                  <td className="px-3 py-2 text-right text-xs">{Number(r.subtotal ?? 0).toLocaleString('en-US')}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold">{Number(r.vat_amount ?? 0).toLocaleString('en-US')}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold">{Number(r.total ?? 0).toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
