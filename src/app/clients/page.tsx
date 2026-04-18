import { supabaseClient } from "@/lib/supabase/client"
import { Plus, Search, Users, TrendingUp, UserCheck, AlertCircle, DollarSign } from "lucide-react"
import Link from "next/link"
import { deleteClient } from "@/app/actions/clients"
import { Trash2, ArrowUpRight, Building2, Phone, Mail } from "lucide-react"
import { OpenClawPageBridge } from "@/components/layout/OpenClawPageBridge"

export const revalidate = 0

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams

  const [
    { data: clients },
    { data: contracts },
    { data: tasks },
    { data: contentItems },
  ] = await Promise.all([
    (supabaseClient as any).from('clients').select('*, client_services(service_name)').order('created_at', { ascending: false }),
    (supabaseClient as any).from('contracts').select('*'),
    (supabaseClient as any).from('tasks').select('id, client_id, status, due_date, priority'),
    (supabaseClient as any).from('content_items').select('id, client_id, platform, schedule_status'),
  ])

  const today = new Date().toISOString().split('T')[0]

  // Enrich each client with computed metrics
  const enriched = (clients || []).map((c: any) => {
    const clientContracts = (contracts || []).filter((ct: any) => ct.client_id === c.id)
    const activeContract = clientContracts.find((ct: any) => ct.status === 'active')
    const expiringContract = clientContracts.find((ct: any) => ct.status === 'ending_soon')
    const clientTasks = (tasks || []).filter((t: any) => t.client_id === c.id)
    const overdueTasks = clientTasks.filter((t: any) => t.status !== 'completed' && t.due_date && t.due_date < today)
    const pendingTasks = clientTasks.filter((t: any) => t.status !== 'completed')
    const clientContent = (contentItems || []).filter((ci: any) => ci.client_id === c.id)
    const revenue = activeContract?.value || 0

    // Health Score
    let health = 100
    if (overdueTasks.length > 0) health -= overdueTasks.length * 8
    if (!activeContract) health -= 25
    if (expiringContract) health -= 15
    if (clientContent.length === 0) health -= 10
    if (c.status === 'paused') health -= 20
    health = Math.max(0, Math.min(100, health))

    return {
      ...c,
      revenue,
      overdueTasks: overdueTasks.length,
      pendingTasks: pendingTasks.length,
      contentCount: clientContent.length,
      health,
      expiringContract: !!expiringContract,
    }
  })

  let filtered = enriched
  if (q) {
    const lq = q.toLowerCase()
    filtered = filtered.filter((c: any) =>
      c.company_name?.toLowerCase().includes(lq) ||
      c.full_name?.toLowerCase().includes(lq) ||
      c.email?.toLowerCase().includes(lq)
    )
  }
  if (status && status !== 'all') {
    filtered = filtered.filter((c: any) => c.status === status)
  }

  const total = clients?.length || 0
  const activeCount = enriched.filter((c: any) => c.status === 'active').length
  const leadCount = enriched.filter((c: any) => c.status === 'lead').length
  const totalRevenue = enriched.filter((c: any) => c.status === 'active').reduce((s: number, c: any) => s + c.revenue, 0)
  const atRiskCount = enriched.filter((c: any) => c.health < 60).length

  const statusBadge: Record<string, string> = {
    active: 'badge-active',
    lead: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    paused: 'badge-secondary',
    inactive: 'badge-secondary',
  }

  const statusDot: Record<string, string> = {
    active: 'bg-emerald-500',
    lead: 'bg-amber-400',
    paused: 'bg-gray-400',
    inactive: 'bg-gray-300',
  }

  const statuses = ['all', 'active', 'lead', 'paused', 'inactive']

  return (
    <div className="space-y-6 pb-10">
      <OpenClawPageBridge page="clients" />

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Users className="h-7 w-7 text-blue-500" /> Client Portfolio
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium">
            {total} clients · {activeCount} active · {leadCount} leads
          </p>
        </div>
        <Link href="/clients/new">
          <button className="btn btn-primary shadow-lg shadow-[hsl(var(--primary)/0.2)] flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Client
          </button>
        </Link>
      </div>

      {/* EXECUTIVE KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Clients',    value: total,                          color: 'border-l-blue-500',    sub: 'All accounts', icon: Users },
          { label: 'Active Clients',   value: activeCount,                    color: 'border-l-emerald-500', sub: 'With active contracts', icon: UserCheck },
          { label: 'Active Revenue',   value: `${totalRevenue.toLocaleString()} SAR`, color: 'border-l-indigo-500', sub: 'Monthly from contracts', icon: DollarSign },
          { label: 'At Risk',          value: atRiskCount,                    color: 'border-l-red-500',     sub: 'Health score < 60', icon: AlertCircle },
        ].map((kpi, i) => (
          <div key={i} className={`premium-card p-4 border-l-4 ${kpi.color} flex items-center gap-4`}>
            <kpi.icon className="h-8 w-8 text-[hsl(var(--muted-foreground))] opacity-40 flex-shrink-0" />
            <div>
              <p className="text-2xl font-black">{kpi.value}</p>
              <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{kpi.label}</p>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))/0.7]">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* SEARCH & FILTER BAR */}
      <div className="premium-card p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <form className="relative flex-1 max-w-md" action="/clients" method="GET">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by company, name, or email..."
            className="form-input pl-10 rounded-full"
          />
          {status && <input type="hidden" name="status" value={status} />}
        </form>
        <div className="flex gap-1.5 flex-wrap">
          {statuses.map(s => (
            <Link key={s} href={`/clients?${q ? `q=${q}&` : ''}status=${s}`}>
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
      </div>

      {/* CLIENTS TABLE */}
      <div className="premium-card overflow-hidden">
        <div className="p-5 border-b border-[hsl(var(--border))] flex items-center justify-between">
          <h2 className="font-bold text-base">{filtered.length} {filtered.length === 1 ? 'Client' : 'Clients'}</h2>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">Click any row to open client profile</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Company / Contact</th>
                <th className="text-left">Contact</th>
                <th className="text-left">Services</th>
                <th className="text-left">Revenue</th>
                <th className="text-left">Health</th>
                <th className="text-left">Tasks</th>
                <th className="text-left">Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-15" />
                    <p className="text-[hsl(var(--muted-foreground))] font-medium">No clients found</p>
                    <Link href="/clients/new">
                      <button className="btn btn-primary mt-4"><Plus className="h-4 w-4" /> Add First Client</button>
                    </Link>
                  </td>
                </tr>
              )}
              {filtered.map((client: any) => (
                <tr key={client.id} className="group cursor-pointer hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
                  <td>
                    <Link href={`/clients/${client.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[hsl(var(--primary)/0.15)] to-purple-100 dark:to-purple-900/30 flex items-center justify-center text-sm font-black text-[hsl(var(--primary))] flex-shrink-0 shadow-sm">
                          {client.company_name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors flex items-center gap-1.5">
                            {client.company_name}
                            {client.expiringContract && <AlertCircle className="h-3.5 w-3.5 text-orange-500" />}
                          </p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{client.full_name || '—'}</p>
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{client.business_type || 'General'}</p>
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <div className="space-y-0.5">
                      {client.email && <p className="text-xs flex items-center gap-1 text-[hsl(var(--muted-foreground))]"><Mail className="h-3 w-3" />{client.email}</p>}
                      {client.phone && <p className="text-xs flex items-center gap-1 text-[hsl(var(--muted-foreground))]"><Phone className="h-3 w-3" />{client.phone}</p>}
                      {!client.email && !client.phone && <span className="text-xs text-[hsl(var(--muted-foreground))]">—</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {client.client_services?.slice(0, 2).map((s: any) => (
                        <span key={s.service_name} className="badge badge-secondary text-[10px]">{s.service_name}</span>
                      ))}
                      {(client.client_services?.length || 0) > 2 && (
                        <span className="badge badge-secondary text-[10px]">+{client.client_services.length - 2}</span>
                      )}
                      {(!client.client_services || client.client_services.length === 0) && (
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">—</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {client.revenue > 0 ? (
                      <span className="text-sm font-bold text-emerald-500">{client.revenue.toLocaleString()} SAR</span>
                    ) : (
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">No contract</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-14 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${client.health >= 85 ? 'bg-emerald-500' : client.health >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${client.health}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${client.health >= 85 ? 'text-emerald-500' : client.health >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                        {client.health}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold">{client.pendingTasks}</span>
                      <span className="text-[hsl(var(--muted-foreground))]">pending</span>
                      {client.overdueTasks > 0 && (
                        <span className="text-red-500 font-bold">({client.overdueTasks} late)</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${statusDot[client.status] || 'bg-gray-400'}`} />
                      <span className={`badge text-[10px] ${statusBadge[client.status] || 'badge-secondary'}`}>
                        {client.status}
                      </span>
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/clients/${client.id}`}>
                        <button className="h-8 w-8 rounded-lg border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))] transition-all">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </Link>
                      <form action={deleteClient.bind(null, client.id)}>
                        <button type="submit" className="h-8 w-8 rounded-lg border border-transparent flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-500 hover:border-red-200 transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
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
