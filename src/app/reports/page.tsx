import Link from 'next/link'
import { supabaseClient } from '@/lib/supabase/client'
import { FileBarChart2, ArrowUpRight, Calendar } from 'lucide-react'

export const revalidate = 0

function fmtDate(val: string | null) {
  if (!val) return '—'
  const d = new Date(val + 'T00:00:00')
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtRange(start: string | null, end: string | null) {
  if (!start && !end) return '—'
  if (!end) return fmtDate(start)
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${start} – ${end}`
  const sameYear = s.getFullYear() === e.getFullYear()
  const sFmt = s.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
  const eFmt = e.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${sFmt} – ${eFmt}`
}

const statusStyle: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300',
  sent: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  archived: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams

  const { data: reports } = await (supabaseClient as any)
    .from('weekly_reports')
    .select(
      'id, report_number, client_id, client_name_snapshot, period_start, period_end, issue_date, status, kpis, platforms, content_items, campaigns, tasks_done, tasks_plan, created_at',
    )
    .order('created_at', { ascending: false })

  const all = reports ?? []
  const filtered = status && status !== 'all' ? all.filter((r: any) => r.status === status) : all

  const total = all.length
  const draftCount = all.filter((r: any) => r.status === 'draft').length
  const sentCount = all.filter((r: any) => r.status === 'sent').length
  const archivedCount = all.filter((r: any) => r.status === 'archived').length

  const statuses = ['all', 'draft', 'sent', 'archived']

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <FileBarChart2 className="h-7 w-7 text-[hsl(var(--primary))]" /> Weekly Reports
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium">
            {total} total · {draftCount} drafts · {sentCount} sent · {archivedCount} archived
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="premium-card p-4 border-l-4 border-l-blue-500">
          <p className="text-2xl font-black">{total}</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Total Reports
          </p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-gray-400">
          <p className="text-2xl font-black">{draftCount}</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Drafts
          </p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-amber-500">
          <p className="text-2xl font-black">{sentCount}</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Sent
          </p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-indigo-500">
          <p className="text-2xl font-black">{archivedCount}</p>
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            Archived
          </p>
        </div>
      </div>

      <div className="premium-card p-4 flex gap-1.5 flex-wrap">
        {statuses.map((s) => (
          <Link key={s} href={`/reports?status=${s}`}>
            <button
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                status === s || (!status && s === 'all')
                  ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))] shadow-sm'
                  : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'
              }`}
            >
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
                <th className="text-left">Report #</th>
                <th className="text-left">Client</th>
                <th className="text-left">Period</th>
                <th className="text-left">Issued</th>
                <th className="text-left">Sections</th>
                <th className="text-left">Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <FileBarChart2 className="h-12 w-12 mx-auto mb-3 opacity-15" />
                    <p className="text-[hsl(var(--muted-foreground))] font-medium">
                      No weekly reports {status && status !== 'all' ? `in "${status}"` : 'yet'}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
                      Ask the agent: &quot;create a weekly report for TechNova&quot;
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map((r: any) => {
                const kpis = (r.kpis ?? []).length
                const platforms = (r.platforms ?? []).length
                const content = (r.content_items ?? []).length
                const campaigns = (r.campaigns ?? []).length
                const done = (r.tasks_done ?? []).length
                const plan = (r.tasks_plan ?? []).length
                return (
                  <tr
                    key={r.id}
                    className="group cursor-pointer hover:bg-[hsl(var(--muted)/0.3)] transition-colors"
                  >
                    <td>
                      <Link href={`/reports/${r.id}`}>
                        <span className="font-bold text-[hsl(var(--primary))]">{r.report_number}</span>
                      </Link>
                    </td>
                    <td>
                      <p className="font-semibold text-sm">{r.client_name_snapshot || '—'}</p>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                        <Calendar className="h-3 w-3" />
                        {fmtRange(r.period_start, r.period_end)}
                      </div>
                    </td>
                    <td>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {fmtDate(r.issue_date)}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                        {kpis > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">KPI {kpis}</span>}
                        {platforms > 0 && <span className="px-1.5 py-0.5 rounded bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400">Soc {platforms}</span>}
                        {content > 0 && <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400">Posts {content}</span>}
                        {campaigns > 0 && <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">Camp {campaigns}</span>}
                        {done > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Done {done}</span>}
                        {plan > 0 && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300">Plan {plan}</span>}
                        {!(kpis || platforms || content || campaigns || done || plan) && (
                          <span className="text-[hsl(var(--muted-foreground))] italic">empty</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                          statusStyle[r.status] ?? statusStyle.draft
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link href={`/reports/${r.id}`}>
                        <button className="h-8 w-8 rounded-lg border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))] transition-all ml-auto">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
