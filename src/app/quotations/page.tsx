import Link from 'next/link'
import { supabaseClient } from '@/lib/supabase/client'
import { FileText, Plus, ArrowUpRight } from 'lucide-react'

export const revalidate = 0

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

function fmtDate(val: string | null) {
  if (!val) return '—'
  const d = new Date(val + 'T00:00:00')
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

const statusStyle: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300',
  sent: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  paid: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
}

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams

  const [{ data: quotations }, { data: items }] = await Promise.all([
    (supabaseClient as any)
      .from('quotations')
      .select('*')
      .order('created_at', { ascending: false }),
    (supabaseClient as any)
      .from('quotation_items')
      .select('quotation_id, pricing_mode, qty, unit_price'),
  ])

  // Compute totals per quotation client-side (small row count).
  const itemsByQuote: Record<string, any[]> = {}
  for (const it of items ?? []) {
    if (!itemsByQuote[it.quotation_id]) itemsByQuote[it.quotation_id] = []
    itemsByQuote[it.quotation_id].push(it)
  }
  const enriched = (quotations ?? []).map((q: any) => {
    const its = itemsByQuote[q.id] ?? []
    const subtotal = its.reduce((s, it) =>
      it.pricing_mode === 'percentage' ? s : s + (Number(it.qty ?? 1) * Number(it.unit_price ?? 0)), 0)
    const vat = Math.round(subtotal * Number(q.vat_rate ?? 15) / 100)
    return { ...q, item_count: its.length, subtotal, total: subtotal + vat }
  })

  const filtered = status && status !== 'all' ? enriched.filter((q: any) => q.status === status) : enriched

  const total = enriched.length
  const draftCount = enriched.filter((q: any) => q.status === 'draft').length
  const sentCount = enriched.filter((q: any) => q.status === 'sent').length
  const acceptedCount = enriched.filter((q: any) => q.status === 'accepted').length
  const pendingValue = enriched
    .filter((q: any) => q.status === 'draft' || q.status === 'sent')
    .reduce((s: number, q: any) => s + (q.total ?? 0), 0)

  const statuses = ['all', 'draft', 'sent', 'accepted', 'rejected', 'paid']

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <FileText className="h-7 w-7 text-[hsl(var(--primary))]" /> Quotations
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium">
            {total} total · {draftCount} drafts · {sentCount} sent · {acceptedCount} accepted
          </p>
        </div>
        <Link href="/quotations/new">
          <button className="btn btn-primary shadow-lg shadow-[hsl(var(--primary)/0.2)] flex items-center gap-2">
            <Plus className="h-4 w-4" /> New Quote
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="premium-card p-4 border-l-4 border-l-blue-500">
          <p className="text-2xl font-black">{total}</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Total Quotes</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-amber-500">
          <p className="text-2xl font-black">{sentCount}</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Sent (awaiting)</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-emerald-500">
          <p className="text-2xl font-black">{acceptedCount}</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Accepted</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-indigo-500">
          <p className="text-2xl font-black">{fmt(pendingValue)} SAR</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Pending Value</p>
        </div>
      </div>

      <div className="premium-card p-4 flex gap-1.5 flex-wrap">
        {statuses.map((s) => (
          <Link key={s} href={`/quotations?status=${s}`}>
            <button className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              status === s || (!status && s === 'all')
                ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))] shadow-sm'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'
            }`}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          </Link>
        ))}
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Quote #</th>
                <th className="text-left">Client</th>
                <th className="text-left">Issued</th>
                <th className="text-left">Items</th>
                <th className="text-left">Total</th>
                <th className="text-left">Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-15" />
                    <p className="text-[hsl(var(--muted-foreground))] font-medium">No quotations {status && status !== 'all' ? `in "${status}"` : 'yet'}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">Ask the WhatsApp agent: &quot;quote MR Amr, social media package 3000 SAR&quot;</p>
                  </td>
                </tr>
              )}
              {filtered.map((q: any) => (
                <tr key={q.id} className="group cursor-pointer hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
                  <td>
                    <Link href={`/quotations/${q.id}`}>
                      <span className="font-bold text-[hsl(var(--primary))]">{q.quote_number}</span>
                    </Link>
                  </td>
                  <td>
                    <div>
                      <p className="font-semibold text-sm">{q.client_name_en || q.client_name_ar || '—'}</p>
                      {q.client_company && <p className="text-xs text-[hsl(var(--muted-foreground))]">{q.client_company}</p>}
                    </div>
                  </td>
                  <td><span className="text-xs text-[hsl(var(--muted-foreground))]">{fmtDate(q.issue_date)}</span></td>
                  <td><span className="text-xs">{q.item_count}</span></td>
                  <td><span className="text-sm font-bold text-emerald-600">{fmt(q.total)} SAR</span></td>
                  <td>
                    <span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusStyle[q.status] ?? statusStyle.draft}`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="text-right">
                    <Link href={`/quotations/${q.id}`}>
                      <button className="h-8 w-8 rounded-lg border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))] transition-all ml-auto">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </Link>
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
