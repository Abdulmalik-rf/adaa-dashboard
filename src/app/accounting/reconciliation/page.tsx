import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Banknote, CheckCircle2, Clock, AlertTriangle, FileText, Upload } from 'lucide-react'
import { UploadStatementBox } from './UploadStatementBox'

export const revalidate = 0

const T = {
  en: {
    pageTitle: 'Bank Reconciliation',
    pageSub: 'Upload bank statements (PDF). The parser extracts each transaction and auto-matches money in against your invoices and money out against your bills. Review and confirm matches to close the loop.',
    uploadTitle: 'Upload statement',
    uploadHint: 'Drop a PDF bank statement (Al Rajhi, SNB, Riyad, ANB, BSF, Mada export). The system extracts each row, parses dates and amounts, and matches against your invoices + bills.',
    pickFile: 'Pick PDF',
    statementsTitle: 'Statements',
    empty: 'No statements uploaded yet.',
    colPeriod: 'Period',
    colAccount: 'Account',
    colTx: 'Transactions',
    colMatched: 'Matched',
    colStatus: 'Status',
    colUploaded: 'Uploaded',
    statusParsed: 'Parsed',
    statusReconciling: 'Reconciling',
    statusReconciled: 'Reconciled',
    statusFailed: 'Failed',
    open: 'Review',
    backLink: '← Back to accounting',
  },
  ar: {
    pageTitle: 'تسوية كشوف البنوك',
    pageSub: 'ارفع كشوف الحسابات البنكية (PDF). يستخرج النظام كل عملية ويربط الإيداعات بفواتير المبيعات والمسحوبات بفواتير المشتريات تلقائياً. راجع المطابقات لإغلاق الدائرة.',
    uploadTitle: 'رفع كشف',
    uploadHint: 'أسقط كشف حساب بنكي PDF (الراجحي، الأهلي، الرياض، العربي، الفرنسي، تصدير مدى). يستخرج النظام كل صف ويحلل التواريخ والمبالغ ويطابق فواتير المبيعات والمشتريات.',
    pickFile: 'اختر PDF',
    statementsTitle: 'الكشوف',
    empty: 'لم تُرفع كشوف بعد.',
    colPeriod: 'الفترة',
    colAccount: 'الحساب',
    colTx: 'العمليات',
    colMatched: 'مطابَقة',
    colStatus: 'الحالة',
    colUploaded: 'تاريخ الرفع',
    statusParsed: 'مُحلّلة',
    statusReconciling: 'تحت التسوية',
    statusReconciled: 'تم التسوية',
    statusFailed: 'فشل',
    open: 'مراجعة',
    backLink: '← العودة إلى المحاسبة',
  },
} as const

const statusBadge: Record<string, string> = {
  parsed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  reconciling: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  reconciled: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

export default async function ReconciliationListPage() {
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const isRtl = locale === 'ar'

  const { data: uploads } = await (supabaseClient as any)
    .from('bank_statement_uploads')
    .select('id, bank_name, account_label, account_iban, period_from, period_to, total_transactions, matched_count, status, parse_error, created_at')
    .order('created_at', { ascending: false })

  const rows = (uploads as any[]) ?? []

  const statusLabel: Record<string, string> = {
    parsed: t.statusParsed,
    reconciling: t.statusReconciling,
    reconciled: t.statusReconciled,
    failed: t.statusFailed,
  }

  return (
    <div className="space-y-6 pb-10" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Banknote className="h-7 w-7 text-emerald-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/accounting" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
          {t.backLink}
        </Link>
      </div>

      <UploadStatementBox ar={isRtl} t={{ title: t.uploadTitle, hint: t.uploadHint, pickFile: t.pickFile }} />

      <div className="premium-card overflow-hidden">
        <div className="px-5 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
          <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
            <FileText className="h-4 w-4" /> {t.statementsTitle} — {rows.length}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
              <tr>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>{t.colPeriod}</th>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>{t.colAccount}</th>
                <th className="px-3 py-2 text-right">{t.colTx}</th>
                <th className="px-3 py-2 text-right">{t.colMatched}</th>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>{t.colStatus}</th>
                <th className={`px-3 py-2 ${isRtl ? 'text-right' : 'text-left'}`}>{t.colUploaded}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center">
                    <Banknote className="h-12 w-12 mx-auto mb-3 opacity-15" />
                    <p className="text-[hsl(var(--muted-foreground))] font-medium">{t.empty}</p>
                  </td>
                </tr>
              )}
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
                  <td className="px-3 py-2 text-xs font-semibold">
                    {r.period_from || '—'} → {r.period_to || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <p className="font-semibold">{r.account_label || r.bank_name || '—'}</p>
                    {r.account_iban && <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{r.account_iban}</p>}
                  </td>
                  <td className="px-3 py-2 text-right font-bold">{r.total_transactions ?? 0}</td>
                  <td className="px-3 py-2 text-right text-xs">
                    <span className={Number(r.matched_count ?? 0) === Number(r.total_transactions ?? 0) && r.total_transactions > 0 ? 'text-emerald-600 font-bold' : 'font-semibold'}>
                      {r.matched_count ?? 0} / {r.total_transactions ?? 0}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusBadge[r.status] || statusBadge.parsed}`}>
                      {statusLabel[r.status] ?? r.status}
                    </span>
                    {r.parse_error && (
                      <p className="text-[10px] text-red-600 mt-1 max-w-[220px] truncate" title={r.parse_error}>
                        <AlertTriangle className="inline h-3 w-3 mr-0.5" />{r.parse_error}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                    {new Date(r.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.status !== 'failed' && (
                      <Link href={`/accounting/reconciliation/${r.id}`} className="btn btn-ghost btn-xs">
                        {t.open}
                      </Link>
                    )}
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
