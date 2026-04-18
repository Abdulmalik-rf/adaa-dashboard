'use client'

import { useState } from 'react'
import { Bell, Check, Trash2, CheckCheck, AlertCircle, MessageSquare, Briefcase, Zap, Search, SlidersHorizontal } from 'lucide-react'
import { markNotificationRead, markAllNotificationsRead } from '@/app/actions/notifications'

const typeIcon: Record<string, { icon: any, color: string }> = {
  task_assigned: { icon: Briefcase, color: 'text-blue-500 bg-blue-500/10' },
  task_completed: { icon: Check, color: 'text-emerald-500 bg-emerald-500/10' },
  contract_alert: { icon: AlertCircle, color: 'text-orange-500 bg-orange-500/10' },
  content_approved: { icon: Zap, color: 'text-green-500 bg-green-500/10' },
  content_rejected: { icon: AlertCircle, color: 'text-red-500 bg-red-500/10' },
  message: { icon: MessageSquare, color: 'text-purple-500 bg-purple-500/10' },
  system: { icon: Bell, color: 'text-gray-500 bg-gray-500/10' },
  default: { icon: Bell, color: 'text-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]' }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function NotificationsDashboard({ notifications }: { notifications: any[] }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const unread = notifications?.filter(n => !n.is_read).length || 0

  const filtered = notifications?.filter(n => {
    if (filter === 'unread' && n.is_read) return false
    if (filter === 'system' && n.type !== 'system') return false
    if (filter === 'tasks' && !n.type.includes('task')) return false
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.message.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Smart Grouping logic
  const urgent = filtered?.filter(n => n.type.includes('alert') || n.type.includes('rejected')) || []
  const standard = filtered?.filter(n => !n.type.includes('alert') && !n.type.includes('rejected')) || []

  return (
    <div className="space-y-6 pb-8 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[hsl(var(--card))] p-6 rounded-2xl border border-[hsl(var(--border))] shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intelligence Feed</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">Real-time alerts, actions, and agency updates.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-secondary btn-sm"><Zap className="h-4 w-4 text-emerald-500" /> WhatsApp Sync</button>
          {unread > 0 && (
            <button onClick={() => markAllNotificationsRead()} className="btn btn-primary btn-sm shadow-md">
              <CheckCheck className="h-4 w-4" /> Mark {unread} Read
            </button>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="tab-list">
          <button onClick={() => setFilter('all')} className={`tab-item ${filter === 'all' ? 'tab-item-active' : ''}`}>All</button>
          <button onClick={() => setFilter('unread')} className={`tab-item ${filter === 'unread' ? 'tab-item-active' : ''}`}>Unread 
            {unread > 0 && <span className="ml-2 bg-[hsl(var(--primary))] text-white px-1.5 py-0.5 rounded-full text-[10px]">{unread}</span>}
          </button>
          <button onClick={() => setFilter('tasks')} className={`tab-item ${filter === 'tasks' ? 'tab-item-active' : ''}`}>Tasks</button>
          <button onClick={() => setFilter('system')} className={`tab-item ${filter === 'system' ? 'tab-item-active' : ''}`}>System</button>
        </div>
        <div className="relative w-full sm:w-64 flex items-center">
           <Search className="absolute left-3 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
           <input className="form-input pl-9 rounded-xl" placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} />
           <SlidersHorizontal className="absolute right-3 h-4 w-4 text-[hsl(var(--muted-foreground))] cursor-pointer" />
        </div>
      </div>

      <div className="space-y-6">
        {(!filtered || filtered.length === 0) && (
          <div className="premium-card p-16 text-center">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-20 text-[hsl(var(--primary))]" />
            <p className="text-[hsl(var(--muted-foreground))] font-semibold">Inbox Zero</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))/0.7] mt-1">You are completely caught up.</p>
          </div>
        )}

        {/* Priority / Urgent */}
        {urgent.length > 0 && (
          <div className="space-y-3">
             <h3 className="text-xs font-bold uppercase tracking-widest text-red-500 px-1">Priority Attention Required</h3>
             <div className="premium-card divide-y divide-[hsl(var(--border))] border-red-500/20 ring-1 ring-red-500/10">
               {urgent.map(n => <NotificationItem key={n.id} n={n} />)}
             </div>
          </div>
        )}

        {/* Standard Feed */}
        {standard.length > 0 && (
          <div className="space-y-3">
             <h3 className="text-xs font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))] px-1">Recent Activity</h3>
             <div className="premium-card divide-y divide-[hsl(var(--border))]">
               {standard.map(n => <NotificationItem key={n.id} n={n} />)}
             </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NotificationItem({ n }: { n: any }) {
  const cfg = typeIcon[n.type] || typeIcon.default
  const Icon = cfg.icon

  return (
    <div className={`flex items-start gap-4 p-5 hover:bg-[hsl(var(--muted)/0.3)] transition-all group ${!n.is_read ? 'bg-gradient-to-r from-[hsl(var(--primary)/0.05)] to-transparent border-l-4 border-[hsl(var(--primary))]' : 'border-l-4 border-transparent'}`}>
      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.color} ring-1 ring-black/5 dark:ring-white/5`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className={`text-sm ${!n.is_read ? 'font-bold text-[hsl(var(--foreground))]' : 'font-semibold text-[hsl(var(--foreground))/0.8]'}`}>{n.title}</p>
            <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] leading-relaxed">{n.message}</p>
          </div>
          <div className="flex flex-col items-end gap-2 text-xs flex-shrink-0">
             <span className="text-[hsl(var(--muted-foreground))/0.8]">{timeAgo(n.created_at)}</span>
             {!n.is_read && <span className="badge bg-[hsl(var(--primary))] text-white border-0 shadow-lg px-2">New</span>}
          </div>
        </div>
        
        {/* Actionable buttons */}
        {!n.is_read && (
          <div className="mt-3 flex gap-2">
             <button onClick={() => markNotificationRead(n.id)} className="btn btn-ghost btn-xs bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-sm hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]">
                <Check className="h-3 w-3" /> Acknowledge
             </button>
             <button className="btn btn-ghost btn-xs bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-sm hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]">
                View Details
             </button>
          </div>
        )}
      </div>
    </div>
  )
}
