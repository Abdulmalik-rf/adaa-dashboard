import { redirect } from 'next/navigation'
import { agentSupabase } from '@/lib/chat-agent/supabase'
import { getCurrentUser } from '@/lib/supabase/server'
import { Activity, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'

export const revalidate = 0
export const dynamic = 'force-dynamic'

// Audit viewer for the AI agents' power-tool calls. Shows the last 100
// entries from public.agent_audit (db_query, db_migrate, db_select,
// db_update, db_delete, run_code, etc.) with sender, payload, result/error,
// and timestamp. Admin-only — server-side gate on currentUser.profile.role.

type AuditRow = {
  id: string
  created_at: string
  sender: string | null
  tool: string
  payload: any
  result: any
  error: string | null
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function summary(row: AuditRow): string {
  if (row.error) return row.error.slice(0, 200)
  const t = row.tool
  const p = row.payload || {}
  const r = row.result || {}
  if (t === 'db_query') return `SELECT — ${r.count ?? '?'} rows. SQL: ${(p.sql || '').slice(0, 80)}`
  if (t === 'db_migrate') return `${(p.sql || '').slice(0, 100)}`
  if (t === 'db_select') return `${p.table} — ${r.count ?? '?'} rows`
  if (t === 'db_insert') return `${p.table} +${r.count ?? '?'}`
  if (t === 'db_update') return `${p.table} ~${r.count ?? '?'}`
  if (t === 'db_delete') return `${p.table} -${r.count ?? '?'}`
  if (t === 'db_count') return `${p.table} = ${r.count ?? '?'}`
  if (t === 'db_describe') return `schema dump (${r.table_count ?? '?'} tables)`
  if (t === 'run_code') return (p.code || '').slice(0, 120)
  return JSON.stringify(p).slice(0, 120)
}

const TOOL_ICON: Record<string, string> = {
  db_describe: '🔍',
  db_select: '👁️',
  db_count: '🔢',
  db_query: '🗃️',
  db_insert: '➕',
  db_update: '✏️',
  db_delete: '🗑️',
  db_migrate: '⚙️',
  run_code: '⚡',
}

export default async function AuditPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login')
  if (me.profile?.role !== 'admin') {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-amber-500" />
        <h1 className="text-xl font-bold mb-2">Admins only</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          The agent audit log is restricted to admin users.
        </p>
      </div>
    )
  }

  // Service-role read so RLS doesn't block — the table is service-role-only.
  const supa = agentSupabase()
  const { data: rows, error } = await supa
    .from('agent_audit')
    .select('id, created_at, sender, tool, payload, result, error')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-200">
          Failed to load audit log: {error.message}
          <p className="mt-2 text-xs opacity-75">
            If this says relation does not exist, run 010_agent_capabilities.sql in Supabase.
          </p>
        </div>
      </div>
    )
  }

  const successes = (rows || []).filter((r) => !r.error).length
  const failures = (rows || []).filter((r) => r.error).length
  const tools = new Set((rows || []).map((r) => r.tool))

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Activity className="h-7 w-7 text-[hsl(var(--primary))]" /> Agent Audit Log
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">
            Last {rows?.length ?? 0} power-tool calls — db queries, migrations, code execution.
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <Stat label="Total" value={rows?.length ?? 0} />
          <Stat label="OK" value={successes} color="text-emerald-600" />
          <Stat label="Errors" value={failures} color={failures > 0 ? 'text-red-600' : ''} />
          <Stat label="Distinct tools" value={tools.size} />
        </div>
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">When</th>
                <th className="text-left">Tool</th>
                <th className="text-left">Sender</th>
                <th className="text-left">Summary</th>
                <th className="text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-25" />
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      No power-tool calls yet — ask the agent something like &quot;describe the database schema&quot; to see entries here.
                    </p>
                  </td>
                </tr>
              )}
              {(rows || []).map((r: AuditRow) => (
                <tr key={r.id} className={r.error ? 'bg-red-50/40 dark:bg-red-950/10' : ''}>
                  <td className="text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                    {fmtTime(r.created_at)}
                  </td>
                  <td>
                    <span className="font-mono text-xs flex items-center gap-1.5">
                      <span>{TOOL_ICON[r.tool] || '🔧'}</span>
                      {r.tool}
                    </span>
                  </td>
                  <td className="text-xs text-[hsl(var(--muted-foreground))] font-mono">
                    {r.sender ? r.sender.slice(0, 16) : '—'}
                  </td>
                  <td className="max-w-xl">
                    <p className="text-xs font-mono text-[hsl(var(--foreground))] break-all line-clamp-3">
                      {summary(r)}
                    </p>
                  </td>
                  <td>
                    {r.error ? (
                      <span className="badge badge-danger text-[10px]">
                        <AlertTriangle className="h-2.5 w-2.5" /> ERROR
                      </span>
                    ) : (
                      <span className="badge badge-success text-[10px]">
                        <CheckCircle2 className="h-2.5 w-2.5" /> OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-[hsl(var(--muted-foreground))] text-center">
        Audit retention is unlimited — this list shows the most recent 100. Older entries remain in <code className="font-mono">public.agent_audit</code>.
      </p>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="premium-card p-3 text-center">
      <p className={`text-lg font-black ${color || ''}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</p>
    </div>
  )
}
