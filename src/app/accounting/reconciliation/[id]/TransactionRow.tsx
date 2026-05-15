'use client'

// Single row in the reconciliation table. Shows the matched invoice/bill
// when auto-matcher found a candidate, lets admin override via a search
// dropdown, and supports unlinking. Confidence is shown as a small chip:
//   auto_high (green) — amount + reference both agreed
//   auto_low  (amber) — only amount agreed (admin should sanity-check)
//   manual    (blue)  — admin set this one
//   unmatched (gray)

import { useState, useTransition } from 'react'
import { Loader2, X, Search, Link2, Check } from 'lucide-react'
import Link from 'next/link'
import { manualMatch } from '@/app/actions/bank-reconciliation'

const confChip: Record<string, string> = {
  auto_high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  auto_low: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  manual: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  unmatched: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export function TransactionRow({
  row,
  ar,
  readOnly,
}: {
  row: any
  ar: boolean
  readOnly: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const isCredit = Number(row.amount) > 0
  const matchedInv = row.matched_invoice
  const matchedBill = row.matched_bill

  function unlink() {
    if (!confirm(ar ? 'إزالة الربط؟' : 'Unlink this match?')) return
    setErr(null)
    startTransition(async () => {
      const r = await manualMatch(row.id, { invoice_id: null, bill_id: null })
      if (!r.ok) setErr(r.error)
    })
  }

  return (
    <tr className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
      <td className="px-3 py-2 text-xs whitespace-nowrap">{row.transaction_date || '—'}</td>
      <td className="px-3 py-2 text-xs max-w-[320px]">
        <p className="truncate" title={row.description}>{row.description || '—'}</p>
      </td>
      <td className={`px-3 py-2 text-right text-xs font-bold ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
        {isCredit ? '+' : '−'}{Math.abs(Number(row.amount ?? 0)).toLocaleString('en-US')}
      </td>
      <td className="px-3 py-2 text-right text-xs text-[hsl(var(--muted-foreground))]">
        {row.balance_after !== null ? Number(row.balance_after).toLocaleString('en-US') : '—'}
      </td>
      <td className="px-3 py-2 text-xs font-mono text-[hsl(var(--muted-foreground))]">{row.reference || '—'}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {matchedInv && (
            <Link href={`/accounting/${matchedInv.id}`} className="text-xs font-semibold text-blue-600 hover:underline">
              {matchedInv.invoice_number} <span className="text-[hsl(var(--muted-foreground))]">· {matchedInv.customer_name}</span>
            </Link>
          )}
          {matchedBill && (
            <Link href={`/accounting/bills/${matchedBill.id}`} className="text-xs font-semibold text-blue-600 hover:underline">
              {matchedBill.bill_reference} <span className="text-[hsl(var(--muted-foreground))]">· {matchedBill.vendor_name}</span>
            </Link>
          )}
          {!matchedInv && !matchedBill && (
            <span className="text-[10px] italic text-[hsl(var(--muted-foreground))]">
              {ar ? 'لا توجد مطابقة' : 'No match'}
            </span>
          )}
          <span className={`badge text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full ${confChip[row.match_confidence] || confChip.unmatched}`}>
            {row.match_confidence || 'unmatched'}
          </span>
          {!readOnly && (matchedInv || matchedBill) && (
            <button onClick={unlink} disabled={pending} className="text-red-500 hover:text-red-700">
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            </button>
          )}
          {!readOnly && !matchedInv && !matchedBill && !editing && (
            <button onClick={() => setEditing(true)} className="text-blue-600 hover:text-blue-800 text-[10px] font-semibold inline-flex items-center gap-1">
              <Link2 className="h-3 w-3" /> {ar ? 'ربط' : 'Link'}
            </button>
          )}
        </div>
        {editing && (
          <ManualMatchPicker
            txId={row.id}
            isCredit={isCredit}
            amount={Math.abs(Number(row.amount ?? 0))}
            ar={ar}
            onDone={() => setEditing(false)}
          />
        )}
        {err && <p className="text-[10px] text-red-600 mt-1">{err}</p>}
      </td>
    </tr>
  )
}

function ManualMatchPicker({
  txId,
  isCredit,
  amount,
  ar,
  onDone,
}: {
  txId: string
  isCredit: boolean
  amount: number
  ar: boolean
  onDone: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, startLink] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  async function doSearch() {
    setSearching(true)
    setErr(null)
    try {
      // Hit the supabase REST directly via the anon client — small fetch
      const res = await fetch(
        isCredit
          ? `/api/reconciliation/search?type=invoice&q=${encodeURIComponent(query)}&amount=${amount}`
          : `/api/reconciliation/search?type=bill&q=${encodeURIComponent(query)}&amount=${amount}`,
      )
      if (!res.ok) throw new Error(`Search failed: ${res.status}`)
      const j = await res.json()
      setResults(j.rows ?? [])
    } catch (e: any) {
      setErr(e?.message ?? 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  function link(target: { invoice_id?: string; bill_id?: string }) {
    startLink(async () => {
      const r = await manualMatch(txId, target)
      if (!r.ok) setErr(r.error)
      else onDone()
    })
  }

  return (
    <div className="mt-2 bg-[hsl(var(--muted)/0.3)] rounded p-2 space-y-2">
      <div className="flex gap-2 items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isCredit ? (ar ? 'ابحث في فواتير المبيعات…' : 'Search invoices…') : (ar ? 'ابحث في فواتير المشتريات…' : 'Search bills…')}
          className="h-8 flex-1 rounded border border-gray-200 dark:border-slate-700 bg-transparent px-2 text-xs"
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
        />
        <button onClick={doSearch} disabled={searching} className="btn btn-ghost btn-xs">
          {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
        </button>
        <button onClick={onDone} className="btn btn-ghost btn-xs">
          <X className="h-3 w-3" />
        </button>
      </div>
      {results.length > 0 && (
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {results.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 bg-[hsl(var(--card))] px-2 py-1 rounded text-xs">
              <span>
                <span className="font-semibold">{r.invoice_number || r.bill_reference}</span>{' '}
                <span className="text-[hsl(var(--muted-foreground))]">· {r.customer_name || r.vendor_name}</span>{' '}
                · <span className="font-bold">{Number(r.total).toLocaleString('en-US')}</span>
              </span>
              <button
                onClick={() => link(isCredit ? { invoice_id: r.id } : { bill_id: r.id })}
                disabled={linking}
                className="btn btn-primary btn-xs">
                {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                {ar ? 'ربط' : 'Link'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="text-[10px] text-red-600">{err}</p>}
    </div>
  )
}
