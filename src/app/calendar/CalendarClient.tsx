"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ChevronLeft, ChevronRight, CalendarDays, CheckSquare, Bell,
  Image as ImageIcon, FileText, FileBarChart2, Receipt,
} from "lucide-react"

type Event = {
  id: string
  date: string                 // ISO YYYY-MM-DD
  kind: 'task' | 'reminder' | 'content' | 'contract_start' | 'contract_end' | 'report_period' | 'quote_issued' | 'quote_valid'
  title: string
  link: string
  client?: string
  meta?: string
  priority?: string
  status?: string
}

const KIND_CONFIG: Record<Event['kind'], { label: string; color: string; icon: any }> = {
  task:           { label: 'Tasks',         color: 'bg-blue-500',     icon: CheckSquare },
  reminder:       { label: 'Reminders',     color: 'bg-amber-500',    icon: Bell },
  content:        { label: 'Content',       color: 'bg-pink-500',     icon: ImageIcon },
  contract_start: { label: 'Contract starts', color: 'bg-emerald-500', icon: FileText },
  contract_end:   { label: 'Contract ends', color: 'bg-red-500',      icon: FileText },
  report_period:  { label: 'Weekly reports',color: 'bg-purple-500',   icon: FileBarChart2 },
  quote_issued:   { label: 'Quotes issued', color: 'bg-cyan-500',     icon: Receipt },
  quote_valid:    { label: 'Quote expires', color: 'bg-orange-500',   icon: Receipt },
}

function ymd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }

export function CalendarClient({
  tasks, reminders, contentItems, contracts, reports, quotations, clients,
}: {
  tasks: any[]; reminders: any[]; contentItems: any[]; contracts: any[];
  reports: any[]; quotations: any[]; clients: { id: string; company_name: string }[]
}) {
  const [cursor, setCursor] = useState(() => new Date())
  const [enabled, setEnabled] = useState<Record<Event['kind'], boolean>>({
    task: true, reminder: true, content: true,
    contract_start: true, contract_end: true,
    report_period: true, quote_issued: true, quote_valid: true,
  })

  const clientName = (id?: string) => clients.find((c) => c.id === id)?.company_name

  // Coalesce every date-bearing row into a single Event[] keyed on YYYY-MM-DD.
  const allEvents = useMemo<Event[]>(() => {
    const out: Event[] = []
    for (const t of tasks) {
      if (t.due_date) out.push({
        id: `task-${t.id}`, date: t.due_date, kind: 'task',
        title: t.title, link: `/tasks`, client: clientName(t.client_id),
        priority: t.priority, status: t.status,
      })
    }
    for (const r of reminders) {
      if (r.due_date) out.push({
        id: `rem-${r.id}`, date: r.due_date, kind: 'reminder',
        title: r.title, link: `/reminders`, client: clientName(r.client_id),
        priority: r.priority, status: r.status,
        meta: r.due_time?.slice(0, 5),
      })
    }
    for (const c of contentItems) {
      if (c.publish_date) out.push({
        id: `content-${c.id}`, date: c.publish_date, kind: 'content',
        title: c.title, link: `/campaigns`, client: clientName(c.client_id),
        meta: `${c.platform} · ${c.content_type}`,
        status: c.schedule_status,
      })
    }
    for (const k of contracts) {
      if (k.start_date) out.push({
        id: `cstart-${k.id}`, date: k.start_date, kind: 'contract_start',
        title: k.title, link: `/contracts`, client: clientName(k.client_id), status: k.status,
      })
      if (k.end_date && k.end_date !== k.start_date) out.push({
        id: `cend-${k.id}`, date: k.end_date, kind: 'contract_end',
        title: k.title, link: `/contracts`, client: clientName(k.client_id), status: k.status,
      })
    }
    for (const r of reports) {
      if (r.period_end) out.push({
        id: `rep-${r.id}`, date: r.period_end, kind: 'report_period',
        title: r.report_number, link: `/reports/${r.id}`,
        client: r.customer_company || r.customer_name, status: r.status,
        meta: 'Period end',
      })
    }
    for (const q of quotations) {
      if (q.issue_date) out.push({
        id: `qi-${q.id}`, date: q.issue_date, kind: 'quote_issued',
        title: q.quote_number, link: `/quotations/${q.id}`,
        client: q.client_company, status: q.status,
      })
      if (q.valid_until) out.push({
        id: `qv-${q.id}`, date: q.valid_until, kind: 'quote_valid',
        title: q.quote_number, link: `/quotations/${q.id}`,
        client: q.client_company, status: q.status,
      })
    }
    return out
  }, [tasks, reminders, contentItems, contracts, reports, quotations, clients])

  // Build month grid: 6 rows × 7 cols, starting on Sunday.
  const grid = useMemo(() => {
    const first = startOfMonth(cursor)
    const last = endOfMonth(cursor)
    const startWeekday = first.getDay()           // 0=Sun..6=Sat
    const totalDays = last.getDate()
    const cells: { date: Date; inMonth: boolean }[] = []

    // Lead with previous-month tail
    for (let i = startWeekday; i > 0; i--) {
      const d = new Date(first)
      d.setDate(d.getDate() - i)
      cells.push({ date: d, inMonth: false })
    }
    // Current month
    for (let i = 1; i <= totalDays; i++) {
      cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), i), inMonth: true })
    }
    // Trail with next-month head to fill 42 cells
    while (cells.length < 42) {
      const lastCell = cells[cells.length - 1].date
      const d = new Date(lastCell)
      d.setDate(d.getDate() + 1)
      cells.push({ date: d, inMonth: false })
    }
    return cells
  }, [cursor])

  // Index events by ymd for O(1) lookup per cell, filtered by which kinds are enabled.
  const eventsByDay = useMemo(() => {
    const map: Record<string, Event[]> = {}
    for (const e of allEvents) {
      if (!enabled[e.kind]) continue
      ;(map[e.date] ||= []).push(e)
    }
    return map
  }, [allEvents, enabled])

  const today = ymd(new Date())
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-[hsl(var(--primary))]" />
            Calendar
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            All scheduled tasks, reminders, content, contracts, reports and quotes in one view.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="btn btn-ghost btn-icon"
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="btn btn-ghost btn-sm"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="btn btn-ghost btn-icon"
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="font-bold text-lg ml-2 min-w-[10ch]">{monthLabel}</h2>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(KIND_CONFIG) as Event['kind'][]).map((k) => {
          const cfg = KIND_CONFIG[k]
          const Icon = cfg.icon
          const active = enabled[k]
          return (
            <button
              key={k}
              onClick={() => setEnabled({ ...enabled, [k]: !active })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                active
                  ? 'bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]'
                  : 'bg-[hsl(var(--muted)/0.4)] border-transparent text-[hsl(var(--muted-foreground))] line-through opacity-60'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${cfg.color}`} />
              <Icon className="h-3 w-3" />
              {cfg.label}
            </button>
          )
        })}
      </div>

      {/* Grid */}
      <div className="premium-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
          {weekDays.map((d) => (
            <div key={d} className="p-2 text-center text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 grid-rows-6">
          {grid.map((cell, i) => {
            const key = ymd(cell.date)
            const events = eventsByDay[key] || []
            const isToday = key === today
            const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6
            return (
              <div
                key={i}
                className={`min-h-[110px] p-1.5 border-r border-b border-[hsl(var(--border))/0.6] ${
                  cell.inMonth ? '' : 'bg-[hsl(var(--muted)/0.2)] opacity-60'
                } ${isToday ? 'bg-[hsl(var(--primary)/0.06)]' : ''} ${
                  isWeekend && cell.inMonth ? 'bg-[hsl(var(--muted)/0.15)]' : ''
                }`}
              >
                <div className={`text-[11px] font-semibold mb-1 ${
                  isToday
                    ? 'inline-flex items-center justify-center h-5 w-5 rounded-full bg-[hsl(var(--primary))] text-white'
                    : cell.inMonth ? '' : 'text-[hsl(var(--muted-foreground))]'
                }`}>
                  {cell.date.getDate()}
                </div>
                <div className="space-y-0.5">
                  {events.slice(0, 3).map((e) => (
                    <Link
                      key={e.id}
                      href={e.link}
                      className="block px-1.5 py-0.5 rounded text-[10px] font-medium truncate hover:opacity-80 transition-opacity"
                      style={{
                        background: 'var(--bg)',
                        color: 'var(--text)',
                        ['--bg' as any]: kindBg(e.kind),
                        ['--text' as any]: kindText(e.kind),
                      } as React.CSSProperties}
                      title={`${KIND_CONFIG[e.kind].label}: ${e.title}${e.client ? ' — ' + e.client : ''}${e.meta ? ' · ' + e.meta : ''}`}
                    >
                      {e.meta && KIND_CONFIG[e.kind].label === 'Reminders' && (
                        <span className="opacity-75 mr-1">{e.meta}</span>
                      )}
                      {e.title}
                    </Link>
                  ))}
                  {events.length > 3 && (
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] px-1.5">
                      +{events.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Empty-state hint */}
      {Object.keys(eventsByDay).length === 0 && (
        <p className="text-center text-sm text-[hsl(var(--muted-foreground))] py-4">
          Nothing scheduled in this month with the active filters.
        </p>
      )}
    </div>
  )
}

function kindBg(kind: Event['kind']) {
  const map: Record<Event['kind'], string> = {
    task: 'rgb(219 234 254)',
    reminder: 'rgb(254 243 199)',
    content: 'rgb(252 231 243)',
    contract_start: 'rgb(209 250 229)',
    contract_end: 'rgb(254 226 226)',
    report_period: 'rgb(237 233 254)',
    quote_issued: 'rgb(207 250 254)',
    quote_valid: 'rgb(254 215 170)',
  }
  return map[kind]
}
function kindText(kind: Event['kind']) {
  const map: Record<Event['kind'], string> = {
    task: 'rgb(30 58 138)',
    reminder: 'rgb(120 53 15)',
    content: 'rgb(157 23 77)',
    contract_start: 'rgb(6 78 59)',
    contract_end: 'rgb(127 29 29)',
    report_period: 'rgb(76 29 149)',
    quote_issued: 'rgb(22 78 99)',
    quote_valid: 'rgb(124 45 18)',
  }
  return map[kind]
}
