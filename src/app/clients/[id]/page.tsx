import { supabaseClient } from "@/lib/supabase/client"
import { notFound, redirect } from "next/navigation"
import { ClientWorkspaceTabs } from "./ClientWorkspaceTabs"
import { ConnectedAccountsTab } from "./ConnectedAccountsTab"
import { deleteClient, updateClientStatus } from "@/app/actions/clients"
import { Trash2, PauseCircle, PlayCircle, Plus, FileSignature, Bell, ListTodo, PlusCircle, User, MapPin, Phone, Mail, Building2, Calendar } from "lucide-react"
import { AddContractModal } from "@/app/contracts/AddContractModal"
import { AddReminderModal } from "@/app/reminders/AddReminderModal"
import { AddTaskModal } from "@/app/tasks/AddTaskModal"

export const revalidate = 0

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  const [
    { data: client, error },
    { data: services },
    { data: socialAccounts },
    { data: contracts },
    { data: reminders },
    { data: files },
    { data: contentItems },
    { data: campaigns },
    { data: logs },
    { data: tasks },
    { data: teamMembers }
  ] = await Promise.all([
    (supabaseClient as any).from('clients').select('*').eq('id', id).single(),
    (supabaseClient as any).from('client_services').select('*').eq('client_id', id),
    (supabaseClient as any).from('social_accounts').select('*').eq('client_id', id),
    (supabaseClient as any).from('contracts').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    (supabaseClient as any).from('reminders').select('*').eq('client_id', id),
    (supabaseClient as any).from('client_files').select('*').eq('client_id', id),
    (supabaseClient as any).from('content_items').select('*').eq('client_id', id),
    (supabaseClient as any).from('ad_campaigns').select('*').eq('client_id', id),
    (supabaseClient as any).from('communication_logs').select('*').eq('client_id', id),
    (supabaseClient as any).from('tasks').select('*').eq('client_id', id).order('due_date', { ascending: true, nullsFirst: false }),
    (supabaseClient as any).from('team_members').select('id, full_name, role, job_title, email, phone, whatsapp, status')
  ])

  if (error || !client) {
    notFound()
  }

  // Fetch contract payments in a second pass (we need the contract ids first).
  const contractIds: string[] = (contracts as any[])?.map((c: any) => c.id) ?? []
  const { data: payments } = contractIds.length > 0
    ? await (supabaseClient as any)
        .from('contract_payments')
        .select('*')
        .in('contract_id', contractIds)
        .order('due_date', { ascending: true })
    : { data: [] as any[] }

  // Bind actions for forms
  const deleteAction = deleteClient.bind(null, id)
  const setStatusActive = updateClientStatus.bind(null, id, 'active')
  const setStatusPaused = updateClientStatus.bind(null, id, 'paused')

  const statusBadge: Record<string, string> = {
    active: 'badge-active',
    paused: 'badge-secondary',
    lead: 'badge-warning',
    inactive: 'badge-secondary',
  }

  const memberById = (assigneeId: string | null | undefined) =>
    assigneeId ? (teamMembers as any[])?.find((m: any) => m.id === assigneeId) ?? null : null
  const findMember = (assigneeId: string) => memberById(assigneeId)?.full_name || 'Unassigned'

  // Helpers used by the Contracts tab.
  const tasksByContract = (contractId: string) =>
    ((tasks as any[]) ?? []).filter((t: any) => t.contract_id === contractId)
  const paymentsByContract = (contractId: string) =>
    ((payments as any[]) ?? []).filter((p: any) => p.contract_id === contractId)
  const fmt = (n: number) => Number(n || 0).toLocaleString('en-US')

  const paymentBadge: Record<string, string> = {
    paid: 'badge-success',
    pending: 'badge-warning',
    overdue: 'badge-danger',
    cancelled: 'badge-secondary',
  }

  const tabs = [
    {
      name: 'Overview',
      content: (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Basic Info */}
          <div className="premium-card p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[hsl(var(--primary))]" /> Basic Information
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-[hsl(var(--muted-foreground))] mt-0.5" />
                <div><p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Contact Person</p><p className="form-medium text-sm">{client.full_name}</p></div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="h-4 w-4 text-[hsl(var(--muted-foreground))] mt-0.5" />
                <div><p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Email</p><p className="form-medium text-sm">{client.email || '—'}</p></div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 text-[hsl(var(--muted-foreground))] mt-0.5" />
                <div><p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Phone / WhatsApp</p><p className="form-medium text-sm">{client.phone || client.whatsapp || '—'}</p></div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-[hsl(var(--muted-foreground))] mt-0.5" />
                <div><p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">City</p><p className="form-medium text-sm">{client.city || '—'}</p></div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-[hsl(var(--muted-foreground))] mt-0.5" />
                <div><p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Start Date</p><p className="form-medium text-sm">{client.start_date || '—'}</p></div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Services */}
            <div className="premium-card p-6">
              <h3 className="text-lg font-bold mb-4">Active Services</h3>
              <div className="flex flex-wrap gap-2">
                {(services as any[])?.length === 0 && <p className="text-sm text-[hsl(var(--muted-foreground))]">No active services assigned.</p>}
                {(services as any[])?.map((s: any) => (
                  <span key={s.id} className="badge badge-secondary">{s.service_name}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      name: 'Social Accounts',
      content: (
        <ConnectedAccountsTab clientId={client.id} initialAccounts={socialAccounts || []} />
      )
    },
    {
      name: 'Contracts',
      content: (
        <div className="space-y-5">
          <div className="flex justify-end">
             <AddContractModal clients={[{id: client.id, company_name: client.company_name}]} />
          </div>
          {(contracts as any[])?.length === 0 ? (
            <div className="premium-card p-12 text-center text-[hsl(var(--muted-foreground))]"><p>No contracts found.</p></div>
          ) : (
            <div className="space-y-5">
              {(contracts as any[])?.map((contract: any) => {
                const cTasks = tasksByContract(contract.id)
                const cPayments = paymentsByContract(contract.id)
                const totalSched = cPayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
                const totalPaid = cPayments
                  .filter((p: any) => p.status === 'paid')
                  .reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
                return (
                  <div key={contract.id} className="premium-card p-6 space-y-5">
                    {/* HEADER */}
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 pb-4 border-b border-[hsl(var(--border))]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-lg">{contract.title}</h4>
                          <span className={`badge ${contract.status === 'active' ? 'badge-active' : contract.status === 'ending_soon' ? 'badge-warning' : contract.status === 'expired' ? 'badge-danger' : 'badge-secondary'}`}>{contract.status?.replace('_', ' ')}</span>
                        </div>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 capitalize">{contract.contract_type?.replace('_', ' ')} · {contract.start_date} → {contract.end_date}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {contract.value !== null && contract.value !== undefined && (
                          <div className="text-right">
                            <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wide">Total Value</p>
                            <p className="text-xl font-black text-emerald-500">{fmt(contract.value)} <span className="text-xs font-medium opacity-70">SAR</span></p>
                          </div>
                        )}
                        {contract.file_url ? (
                          <a href={contract.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-outline text-xs flex items-center gap-1 whitespace-nowrap">
                            📄 Open PDF
                          </a>
                        ) : (
                          <span className="text-[10px] text-[hsl(var(--muted-foreground))] italic">no PDF attached</span>
                        )}
                      </div>
                    </div>

                    {/* WHAT IT'S ABOUT */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-2">What this covers</p>
                      <p className="text-sm leading-relaxed">
                        {contract.scope || contract.notes || <span className="italic text-[hsl(var(--muted-foreground))]">No scope specified — ask the agent &quot;update contract {contract.title}, scope: ...&quot;.</span>}
                      </p>
                    </div>

                    {/* TASK SCHEDULE */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Delivery schedule · {cTasks.length} {cTasks.length === 1 ? 'task' : 'tasks'}</p>
                      </div>
                      {cTasks.length === 0 ? (
                        <p className="text-xs text-[hsl(var(--muted-foreground))] italic p-3 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-dashed border-[hsl(var(--border))]">
                          No tasks linked to this contract yet. Tell the agent: &quot;add task X for contract {contract.title}, due Y, assign to Z&quot;.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {cTasks.map((t: any) => {
                            const m = memberById(t.assignee_id)
                            return (
                              <div key={t.id} className="p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] flex flex-col md:flex-row md:items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold">{t.title}</p>
                                  <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">
                                    Due: {t.due_date || '—'} · Priority: <span className={t.priority === 'urgent' || t.priority === 'high' ? 'text-red-500 font-bold' : ''}>{t.priority}</span>
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                                  {m ? (
                                    <div className="text-right text-[11px] leading-tight">
                                      <p className="font-semibold">{m.full_name}</p>
                                      <p className="text-[hsl(var(--muted-foreground))]">{m.job_title || m.role}</p>
                                      {(m.phone || m.whatsapp || m.email) && (
                                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                                          {m.whatsapp && <a href={`https://wa.me/${String(m.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-500">WA</a>}
                                          {m.whatsapp && (m.phone || m.email) && ' · '}
                                          {m.phone && <a href={`tel:${m.phone}`} className="hover:text-[hsl(var(--primary))]">{m.phone}</a>}
                                          {m.phone && m.email && ' · '}
                                          {m.email && <a href={`mailto:${m.email}`} className="hover:text-[hsl(var(--primary))]">{m.email}</a>}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[11px] italic text-[hsl(var(--muted-foreground))]">Unassigned</span>
                                  )}
                                  <span className={`badge text-[10px] ${t.status === 'completed' ? 'badge-success' : t.status === 'in_progress' ? 'badge-warning' : 'badge-secondary'}`}>{t.status?.replace('_', ' ')}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* PAYMENT SCHEDULE */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Payment schedule</p>
                        {totalSched > 0 && (
                          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                            <span className="text-emerald-500 font-semibold">{fmt(totalPaid)}</span> / {fmt(totalSched)} SAR paid
                          </p>
                        )}
                      </div>
                      {cPayments.length === 0 ? (
                        <p className="text-xs text-[hsl(var(--muted-foreground))] italic p-3 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-dashed border-[hsl(var(--border))]">
                          No payments scheduled. Tell the agent: &quot;schedule a payment of 5000 SAR for contract {contract.title}, due next Friday&quot;.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
                          <table className="w-full text-sm">
                            <thead className="bg-[hsl(var(--muted)/0.4)]">
                              <tr className="text-left text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                                <th className="px-3 py-2 font-bold">#</th>
                                <th className="px-3 py-2 font-bold">Due</th>
                                <th className="px-3 py-2 font-bold">Paid</th>
                                <th className="px-3 py-2 font-bold text-right">Amount (SAR)</th>
                                <th className="px-3 py-2 font-bold">Method</th>
                                <th className="px-3 py-2 font-bold">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cPayments.map((p: any, i: number) => (
                                <tr key={p.id} className="border-t border-[hsl(var(--border))]">
                                  <td className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">{i + 1}</td>
                                  <td className="px-3 py-2 font-medium">{p.due_date}</td>
                                  <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">{p.paid_date || '—'}</td>
                                  <td className="px-3 py-2 text-right font-bold">{fmt(p.amount)}</td>
                                  <td className="px-3 py-2 text-xs capitalize">{p.method || '—'}</td>
                                  <td className="px-3 py-2"><span className={`badge text-[10px] ${paymentBadge[p.status] ?? 'badge-secondary'}`}>{p.status}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    },
    {
      name: 'Reminders',
      content: (
        <div className="space-y-4">
          <div className="flex justify-end">
             <AddReminderModal clients={[{id: client.id, company_name: client.company_name}]} />
          </div>
          {(reminders as any[])?.length === 0 ? (
            <div className="premium-card p-12 text-center text-[hsl(var(--muted-foreground))]"><p>No reminders found.</p></div>
          ) : (
            <div className="space-y-3">
              {(reminders as any[])?.map((reminder: any) => (
                <div key={reminder.id} className="premium-card p-4 flex justify-between items-center bg-[hsl(var(--card))]">
                  <div>
                    <h4 className={`font-semibold flex items-center gap-2 ${reminder.status === 'completed' ? 'line-through opacity-60' : ''}`}>
                      {reminder.title}
                      {reminder.status === 'completed' && <span className="badge badge-success text-[10px]">Completed</span>}
                    </h4>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{reminder.type} • Due: {reminder.due_date}</p>
                  </div>
                  <span className={`badge ${reminder.priority === 'high' ? 'badge-danger' : reminder.priority === 'urgent' ? 'badge-danger' : reminder.priority === 'medium' ? 'badge-warning' : 'badge-secondary'}`}>{reminder.priority}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    },
    {
      name: 'Tasks',
      content: (
        <div className="space-y-4">
          <div className="flex justify-end">
             <AddTaskModal clients={[{id: client.id, company_name: client.company_name}]} teamMembers={teamMembers || []} />
          </div>
          {(tasks as any[])?.length === 0 ? (
            <div className="premium-card p-12 text-center text-[hsl(var(--muted-foreground))]"><p>No tasks assigned.</p></div>
          ) : (
            <div className="space-y-3">
              {tasks?.map((task: any) => (
                <div key={task.id} className="premium-card p-4 flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold">{task.title}</h4>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Assignee: {findMember(task.assignee_id)} • Due: {task.due_date || 'No date'}</p>
                  </div>
                  <div className="text-right">
                    <span className={`badge ${task.status === 'completed' ? 'badge-success' : task.status === 'in_progress' ? 'badge-warning' : 'badge-secondary'}`}>{task.status?.replace('_', ' ')}</span>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1 capitalize">Priority: <strong className={task.priority === 'urgent' || task.priority === 'high' ? 'text-red-500' : ''}>{task.priority}</strong></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    },
    {
      name: 'Files',
      content: (
        <div className="space-y-4">
          <div className="premium-card p-6">
            <h3 className="text-lg font-bold mb-4">Documents & Assets</h3>
            {(files as any[])?.length === 0 ? (
               <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-6">No files uploaded.</p>
            ) : (
              <div className="space-y-3">
                {(files as any[])?.map((file: any) => (
                  <div key={file.id} className="flex justify-between items-center p-3 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.4)] transition-colors">
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase mt-0.5">{file.category || 'Asset'} • {file.file_type}</p>
                    </div>
                    <a href={file.storage_path} download className="btn btn-ghost btn-xs text-[hsl(var(--primary))]">Download</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      name: 'Financials',
      content: (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="p-4 rounded-xl border border-[hsl(var(--border))] bg-emerald-500/5">
                <p className="text-[10px] font-bold text-emerald-600 uppercase">Monthly Revenue</p>
                <p className="text-2xl font-bold mt-1">{(contracts?.filter((c: any) => c.status === 'active').reduce((sum: number, c: any) => sum + (c.value || 0), 0) || 0).toLocaleString()} <span className="text-xs opacity-60">SAR</span></p>
             </div>
             <div className="p-4 rounded-xl border border-[hsl(var(--border))]">
                <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Est. Profit Margin</p>
                <p className="text-2xl font-bold mt-1">78%</p>
             </div>
             <div className="p-4 rounded-xl border border-[hsl(var(--border))]">
                <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Lifetime Value</p>
                <p className="text-2xl font-bold mt-1">124,000 <span className="text-xs opacity-60">SAR</span></p>
             </div>
          </div>
          <div className="premium-card p-6">
             <h3 className="font-bold text-sm mb-4">Financial Snapshots</h3>
             <div className="space-y-3">
                <div className="flex justify-between items-center p-3 rounded-lg bg-[hsl(var(--muted)/0.3)]">
                   <span className="text-xs font-medium">Service Retention Fee</span>
                   <span className="text-xs font-bold">15,000 SAR</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-[hsl(var(--muted)/0.3)]">
                   <span className="text-xs font-medium">Ad Management Premium</span>
                   <span className="text-xs font-bold">2,500 SAR</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-red-500/5 text-red-600 border border-red-500/10">
                   <span className="text-xs font-medium">Linked Media Spend (Mock)</span>
                   <span className="text-xs font-bold">- 4,200 SAR</span>
                </div>
             </div>
             <div className="mt-6 pt-4 border-t border-[hsl(var(--border))] flex justify-between items-center">
                <span className="font-bold text-sm">Projected Net Monthly Profit</span>
                <span className="font-bold text-lg text-emerald-600">13,300 SAR</span>
             </div>
          </div>
        </div>
      )
    }
  ]

  return (
    <div className="space-y-6 pb-8">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 premium-card">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[hsl(var(--primary)/0.2)] to-purple-200 dark:to-purple-900/40 flex items-center justify-center text-sm font-bold text-[hsl(var(--primary))] shadow-sm">
              {client.company_name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{client.company_name}</h1>
                <span className={`badge ${statusBadge[client.status] || 'badge-secondary'}`}>{client.status}</span>
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">Workspace & Managed Operations</p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
           <form action={setStatusActive}>
             <button type="submit" className="btn btn-secondary btn-sm" disabled={client.status === 'active'}>
               <PlayCircle className="h-4 w-4" /> Activate
             </button>
           </form>
           <form action={setStatusPaused}>
             <button type="submit" className="btn btn-secondary btn-sm" disabled={client.status === 'paused'}>
               <PauseCircle className="h-4 w-4" /> Pause
             </button>
           </form>
           <form action={deleteAction}>
             <button type="submit" className="btn btn-ghost btn-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
               <Trash2 className="h-4 w-4" /> Delete
             </button>
           </form>
        </div>
      </div>
      
      {/* Workspace Content via Tabs */}
      <div className="premium-card overflow-hidden">
        <ClientWorkspaceTabs tabs={tabs} />
      </div>
    </div>
  )
}
