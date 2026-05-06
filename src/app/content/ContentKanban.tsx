"use client"

import { useState, useMemo } from "react"
import { Image as ImageIcon, Calendar, User as UserIcon, ArrowRight, Search } from "lucide-react"
import { updateContentScheduleStatus } from "@/app/actions/content"

type Item = {
  id: string
  title: string
  caption?: string | null
  platform: string
  content_type: string
  publish_date: string
  publish_time?: string | null
  schedule_status: string
  client_id?: string | null
  assignee_id?: string | null
}

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: 'idea',      label: 'Ideas',      color: 'bg-gray-400' },
  { key: 'pending',   label: 'Pending',    color: 'bg-amber-500' },
  { key: 'approved',  label: 'Approved',   color: 'bg-blue-500' },
  { key: 'scheduled', label: 'Scheduled',  color: 'bg-purple-500' },
  { key: 'published', label: 'Published',  color: 'bg-emerald-500' },
]

const PLATFORM_ICON: Record<string, string> = {
  instagram: '📸', tiktok: '🎬', snapchat: '👻', google_ads: '🎯',
  facebook: '📘', twitter: '🐦', linkedin: '💼', youtube: '📺',
}

export function ContentKanban({
  items: initialItems, clients, teamMembers,
}: {
  items: Item[]
  clients: { id: string; company_name: string }[]
  teamMembers: { id: string; full_name: string }[]
}) {
  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const clientName = (id?: string | null) => clients.find((c) => c.id === id)?.company_name
  const assigneeName = (id?: string | null) => teamMembers.find((t) => t.id === id)?.full_name

  // Filter once, then group by column.
  const grouped = useMemo(() => {
    const filtered = items.filter((i) => {
      if (filterClient && i.client_id !== filterClient) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        i.title.toLowerCase().includes(q) ||
        (i.caption || '').toLowerCase().includes(q) ||
        (clientName(i.client_id) || '').toLowerCase().includes(q)
      )
    })
    const out: Record<string, Item[]> = {}
    for (const c of COLUMNS) out[c.key] = []
    for (const it of filtered) {
      const k = COLUMNS.find((c) => c.key === it.schedule_status) ? it.schedule_status : 'idea'
      out[k].push(it)
    }
    return out
  }, [items, search, filterClient, clients])

  async function moveTo(item: Item, newStatus: string) {
    if (newStatus === item.schedule_status) return
    setBusy(item.id)
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, schedule_status: newStatus } : i)),
    )
    try {
      await updateContentScheduleStatus(item.id, newStatus)
    } catch (err: any) {
      // Roll back on error
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, schedule_status: item.schedule_status } : i)),
      )
      alert('Move failed: ' + (err?.message ?? 'unknown'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-[hsl(var(--primary))]" />
            Content Pipeline
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Editorial board for posts, reels, stories — drag through the stages from idea to published.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <input
              className="form-input h-9 pl-10 text-sm w-56"
              placeholder="Search title / caption…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-input h-9 text-sm w-44"
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNS.map((col) => {
          const list = grouped[col.key] || []
          return (
            <div key={col.key} className="kanban-column">
              <div className="flex items-center justify-between sticky top-0 bg-[hsl(var(--background))] z-10 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.color}`} />
                  <h3 className="font-bold text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                    {col.label}
                  </h3>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">({list.length})</span>
                </div>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto">
                {list.length === 0 && (
                  <div className="text-xs text-[hsl(var(--muted-foreground))] text-center py-8 opacity-50">
                    Empty
                  </div>
                )}
                {list.map((item) => (
                  <Card
                    key={item.id}
                    item={item}
                    busy={busy === item.id}
                    clientName={clientName(item.client_id) || undefined}
                    assignee={assigneeName(item.assignee_id) || undefined}
                    onMove={(newStatus) => moveTo(item, newStatus)}
                    currentColIndex={COLUMNS.findIndex((c) => c.key === col.key)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Card({
  item, busy, clientName, assignee, onMove, currentColIndex,
}: {
  item: Item
  busy: boolean
  clientName?: string
  assignee?: string
  onMove: (newStatus: string) => void
  currentColIndex: number
}) {
  const nextCol = COLUMNS[currentColIndex + 1]
  return (
    <div className={`premium-card p-3 space-y-2 transition-opacity ${busy ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm leading-snug line-clamp-2">{item.title}</p>
        <span className="text-base flex-shrink-0">{PLATFORM_ICON[item.platform] || '📋'}</span>
      </div>
      {item.caption && (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))] line-clamp-2">{item.caption}</p>
      )}
      <div className="flex flex-wrap gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
        <span className="badge badge-secondary text-[9px]">{item.platform}</span>
        <span className="badge badge-secondary text-[9px]">{item.content_type}</span>
      </div>
      <div className="space-y-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">
        {clientName && <p className="truncate">📍 {clientName}</p>}
        {item.publish_date && (
          <p className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {item.publish_date}{item.publish_time ? ` · ${item.publish_time.slice(0, 5)}` : ''}
          </p>
        )}
        {assignee && (
          <p className="flex items-center gap-1">
            <UserIcon className="h-3 w-3" />
            {assignee}
          </p>
        )}
      </div>
      <div className="flex gap-1 pt-1">
        <select
          className="form-input h-6 !py-0 text-[10px] flex-1"
          value={item.schedule_status}
          onChange={(e) => onMove(e.target.value)}
          disabled={busy}
        >
          {COLUMNS.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        {nextCol && (
          <button
            type="button"
            onClick={() => onMove(nextCol.key)}
            disabled={busy}
            className="btn btn-ghost btn-xs !p-1"
            title={`Move to ${nextCol.label}`}
          >
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
