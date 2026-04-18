'use client'

import { useState } from 'react'
import { Plus, FileText, Trash2, AlertTriangle, Calendar, DollarSign, Building2 } from 'lucide-react'
import { createContract, deleteContract } from '@/app/actions/contracts'

interface Contract {
  id: string
  client_id: string
  title: string
  contract_type: string
  value?: number
  currency?: string
  start_date: string
  end_date: string
  status: string
  payment_cycle?: string
  notes?: string
}

interface Client {
  id: string
  company_name: string
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'badge-active' },
  ending_soon: { label: 'Ending Soon', cls: 'badge-warning' },
  expired: { label: 'Expired', cls: 'badge-danger' },
  draft: { label: 'Draft', cls: 'badge-secondary' },
  cancelled: { label: 'Cancelled', cls: 'badge-secondary' },
}

export function ContractsClient({ contracts, clients }: { contracts: Contract[]; clients: Client[] }) {
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const filtered = filterStatus === 'all'
    ? contracts
    : contracts.filter(c => c.status === filterStatus)

  const findClient = (id: string) => clients.find(c => c.id === id)?.company_name || '—'

  const totalValue = contracts.filter(c => c.status === 'active').reduce((acc, c) => acc + (c.value || 0), 0)
  const expiringCount = contracts.filter(c => c.status === 'ending_soon').length
  const expiredCount = contracts.filter(c => c.status === 'expired').length

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    await createContract(fd)
    setSaving(false)
    setShowModal(false)
    window.location.reload()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this contract? This cannot be undone.')) return
    await deleteContract(id)
    window.location.reload()
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contracts</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">Manage client agreements and renewals</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary">
          <Plus className="h-4 w-4" /> New Contract
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            <span className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Active Value</span>
          </div>
          <div className="text-2xl font-bold mt-2">{totalValue.toLocaleString()} SAR</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Ending Soon</span>
          </div>
          <div className="text-2xl font-bold mt-2">{expiringCount}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Expired</span>
          </div>
          <div className="text-2xl font-bold mt-2">{expiredCount}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="tab-list w-fit">
        {['all', 'active', 'ending_soon', 'expired', 'draft'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`tab-item ${filterStatus === s ? 'tab-item-active' : ''}`}>
            {s === 'all' ? 'All' : s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Contracts Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 && (
          <div className="col-span-full premium-card p-16 text-center">
            <FileText className="h-12 w-12 mx-auto mb-3 text-[hsl(var(--muted-foreground))] opacity-30" />
            <p className="text-[hsl(var(--muted-foreground))]">No contracts found</p>
            <button onClick={() => setShowModal(true)} className="btn btn-primary mt-4">
              <Plus className="h-4 w-4" /> Create First Contract
            </button>
          </div>
        )}
        {filtered.map(contract => {
          const cfg = statusConfig[contract.status] || { label: contract.status, cls: 'badge-secondary' }
          const daysLeft = Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / 86400000)
          return (
            <div key={contract.id} className="premium-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm truncate">{contract.title}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Building2 className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">{findClient(contract.client_id)}</span>
                  </div>
                </div>
                <span className={`badge text-[10px] flex-shrink-0 ${cfg.cls}`}>{cfg.label}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Type</p>
                  <p className="font-medium text-xs capitalize">{contract.contract_type?.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Billing</p>
                  <p className="font-medium text-xs capitalize">{contract.payment_cycle?.replace('_', ' ') || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Value</p>
                  <p className="font-bold text-sm text-[hsl(var(--foreground))]">{contract.value ? `${contract.value.toLocaleString()} ${contract.currency || 'SAR'}` : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-0.5">Ends</p>
                  <p className={`font-medium text-xs ${daysLeft < 30 && daysLeft > 0 ? 'text-amber-600' : daysLeft <= 0 ? 'text-red-500' : ''}`}>
                    {contract.end_date}
                    {daysLeft > 0 && daysLeft < 60 && <span className="ml-1 text-[10px]">({daysLeft}d)</span>}
                    {daysLeft <= 0 && <span className="ml-1 text-[10px]">(Expired)</span>}
                  </p>
                </div>
              </div>

              {contract.status === 'ending_soon' && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-700 dark:text-amber-400">This contract is ending soon. Consider initiating a renewal.</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[hsl(var(--border))]">
                <button
                  onClick={() => handleDelete(contract.id)}
                  className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content">
            <h2 className="text-xl font-bold mb-6">New Contract</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="form-group">
                <label className="form-label">Client</label>
                <select name="client_id" className="form-input" required>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Contract Title</label>
                <input name="title" className="form-input" placeholder="e.g. Annual Social Media Retainer" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select name="contract_type" className="form-input" required>
                    <option value="retainer">Retainer</option>
                    <option value="project">Project</option>
                    <option value="hourly">Hourly</option>
                    <option value="performance">Performance</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Billing Cycle</label>
                  <select name="payment_cycle" className="form-input">
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="one-time">One-time</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Value (SAR)</label>
                  <input name="value" type="number" className="form-input" placeholder="0.00" step="0.01" />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select name="status" className="form-input">
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="ending_soon">Ending Soon</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input name="start_date" type="date" className="form-input" required />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date</label>
                  <input name="end_date" type="date" className="form-input" required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea name="notes" className="form-input" placeholder="Any additional notes..." rows={2} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Creating...' : '✓ Create Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
