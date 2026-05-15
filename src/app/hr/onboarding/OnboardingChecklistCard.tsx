'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { toggleOnboardingItem } from '@/app/actions/hr-automation'

const categoryColor: Record<string, string> = {
  paperwork: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  access: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  compliance: 'bg-red-500/15 text-red-700 dark:text-red-300',
  orientation: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
}

export function OnboardingChecklistCard({
  checklist, items, ar, collapsed = false,
}: { checklist: any; items: any[]; ar: boolean; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  const doneCount = items.filter((it) => it.done).length
  const pct = items.length === 0 ? 0 : Math.round((doneCount / items.length) * 100)
  const emp = checklist.team_members

  function toggle(item: any) {
    setErr(null)
    setPendingId(item.id)
    startTransition(async () => {
      const r = await toggleOnboardingItem({ item_id: item.id, done: !item.done })
      if (!r.ok) setErr(r.error)
      setPendingId(null)
    })
  }

  return (
    <div className="premium-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full p-4 flex items-center justify-between hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
        <div className={`flex items-center gap-3 ${ar ? 'flex-row-reverse' : ''}`}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <div className={ar ? 'text-right' : 'text-left'}>
            <p className="font-bold text-sm">{emp?.full_name ?? '—'}{emp?.full_name_ar ? <span className="text-[hsl(var(--muted-foreground))]"> · {emp.full_name_ar}</span> : ''}</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              {checklist.template.replace(/_/g, ' ')} · started {new Date(checklist.started_at).toLocaleDateString()}{emp?.hire_date ? ` · hired ${emp.hire_date}` : ''}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-3 ${ar ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs font-bold">{doneCount}/{items.length}</span>
          <div className="w-32 h-2 rounded-full bg-[hsl(var(--muted)/0.3)] overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] w-10 text-right">{pct}%</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-[hsl(var(--border))]">
          <ul className="divide-y divide-[hsl(var(--border))]">
            {items.length === 0 && <li className="px-4 py-6 text-center text-xs italic text-[hsl(var(--muted-foreground))]">No items.</li>}
            {items.map((it) => (
              <li key={it.id} className={`px-4 py-2 flex items-center gap-3 ${ar ? 'flex-row-reverse' : ''}`}>
                <button
                  onClick={() => toggle(it)}
                  disabled={pendingId === it.id}
                  className={`h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                    it.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[hsl(var(--border))] hover:border-emerald-500'
                  }`}>
                  {pendingId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : it.done ? <Check className="h-3 w-3" /> : null}
                </button>
                <div className={`flex-1 min-w-0 ${ar ? 'text-right' : 'text-left'}`}>
                  <p className={`text-sm ${it.done ? 'line-through text-[hsl(var(--muted-foreground))]' : 'font-medium'}`}>{ar ? (it.title_ar || it.title) : it.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {it.category && (
                      <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${categoryColor[it.category] || 'bg-gray-500/15 text-gray-700'}`}>
                        {it.category}
                      </span>
                    )}
                    {it.owner_role && (
                      <span className="text-[9px] uppercase font-bold text-[hsl(var(--muted-foreground))]">{it.owner_role}</span>
                    )}
                    {it.due_offset_days != null && (
                      <span className="text-[9px] text-[hsl(var(--muted-foreground))]">+{it.due_offset_days}d</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {err && <p className="px-4 py-2 text-xs text-red-600">{err}</p>}
        </div>
      )}
    </div>
  )
}
