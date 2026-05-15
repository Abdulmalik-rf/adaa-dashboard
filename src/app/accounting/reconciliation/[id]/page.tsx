import { supabaseClient } from '@/lib/supabase/client'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { ArrowLeft, Banknote, CheckCircle2, AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react'
import { TransactionRow } from './TransactionRow'
import { FinalizeButton } from './FinalizeButton'

export const revalidate = 0

export default async function ReconciliationDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const ar = locale === 'ar'

  const { data: upload, error } = await (supabaseClient as any)
    .from('bank_statement_uploads').select('*').eq('id', id).maybeSingle()
  if (error || !upload) return notFound()

  const { data: txs } = await (supabaseClient as any)
    .from('bank_transactions')
    .select(`
      id, transaction_date, description, amount, balance_after, reference,
      matched_invoice_id, matched_bill_id, match_confidence,
      matched_invoice:matched_invoice_id (id, invoice_number, customer_name, total),
      matched_bill:matched_bill_id (id, bill_reference, vendor_name, total)
    `)
    .eq('statement_upload_id', id)
    .order('transaction_date')

  const rows = (txs as any[]) ?? []
  const credits = rows.filter((r) => Number(r.amount) > 0)
  const debits = rows.filter((r) => Number(r.amount) < 0)
  const matched = rows.filter((r) => r.match_confidence && r.match_confidence !== 'unmatched')
  const totalCreditAmt = credits.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const totalDebitAmt = debits.reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0)

  const t = ar
    ? {
        backLink: '← العودة',
        period: 'الفترة',
        account: 'الحساب',
        tx: 'عمليات',
        matched: 'مطابَقة',
        credits: 'إيداعات',
        debits: 'مسحوبات',
        unmatched: 'غير مطابَقة',
        finalize: 'إنهاء التسوية',
        colDate: 'التاريخ',
        colDescription: 'الوصف',
        colAmount: 'المبلغ',
        colBalance: 'الرصيد',
        colRef: 'المرجع',
        colMatch: 'مرتبطة بـ',
        statementReconciled: 'تم تسوية هذا الكشف.',
        none: 'لا توجد عمليات.',
        rawText: 'النص الخام المستخرَج (للتصحيح)',
      }
    : {
        backLink: '← Back',
        period: 'Period',
        account: 'Account',
        tx: 'transactions',
        matched: 'matched',
        credits: 'credits',
        debits: 'debits',
        unmatched: 'unmatched',
        finalize: 'Finalize reconciliation',
        colDate: 'Date',
        colDescription: 'Description',
        colAmount: 'Amount',
        colBalance: 'Balance',
        colRef: 'Reference',
        colMatch: 'Matched to',
        statementReconciled: 'This statement has been reconciled.',
        none: 'No transactions.',
        rawText: 'Raw extracted text (for debugging)',
      }

  return (
    <div className="space-y-6 pb-10" dir={ar ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/accounting/reconciliation" className="btn btn-ghost btn-icon">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Banknote className="h-6 w-6 text-emerald-500" />
              {upload.account_label || upload.bank_name || 'Bank statement'}
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {t.period}: {upload.period_from || '—'} → {upload.period_to || '—'}
              {upload.account_iban ? ` · ${upload.account_iban}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {upload.status !== 'reconciled' && rows.length > 0 && <FinalizeButton uploadId={upload.id} ar={ar} label={t.finalize} />}
        </div>
      </div>

      {upload.status === 'reconciled' && (
        <div className="premium-card p-4 border-l-4 border-l-emerald-500 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <p className="font-semibold text-sm">{t.statementReconciled}</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="premium-card p-4 border-l-4 border-l-blue-500">
          <p className="text-2xl font-black">{rows.length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.tx}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-emerald-500">
          <p className="text-2xl font-black">{matched.length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.matched}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-amber-500">
          <p className="text-2xl font-black">{rows.length - matched.length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.unmatched}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-emerald-500">
          <p className="text-2xl font-black">{totalCreditAmt.toLocaleString('en-US')} <span className="text-xs">SAR</span></p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide flex items-center gap-1">
            <ArrowDown className="h-3 w-3 text-emerald-500" /> {t.credits}
          </p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-red-500">
          <p className="text-2xl font-black">{totalDebitAmt.toLocaleString('en-US')} <span className="text-xs">SAR</span></p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide flex items-center gap-1">
            <ArrowUp className="h-3 w-3 text-red-500" /> {t.debits}
          </p>
        </div>
      </div>

      {/* Transactions table */}
      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
              <tr>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colDate}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colDescription}</th>
                <th className="px-3 py-2 text-right">{t.colAmount}</th>
                <th className="px-3 py-2 text-right">{t.colBalance}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colRef}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colMatch}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-12 text-center text-xs text-[hsl(var(--muted-foreground))] italic">{t.none}</td></tr>
              )}
              {rows.map((r: any) => (
                <TransactionRow key={r.id} row={r} ar={ar} readOnly={upload.status === 'reconciled'} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw text — collapsed by default. Useful when parsing was partial. */}
      {upload.raw_text && (
        <details className="premium-card p-4 text-xs">
          <summary className="font-bold cursor-pointer text-[hsl(var(--muted-foreground))]">{t.rawText}</summary>
          <pre className="mt-3 whitespace-pre-wrap text-[10px] leading-snug max-h-96 overflow-y-auto bg-[hsl(var(--muted)/0.2)] p-3 rounded">
            {upload.raw_text}
          </pre>
        </details>
      )}
    </div>
  )
}
