'use client'

import { useState, useTransition } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import { approveLeaveRequest, rejectLeaveRequest } from '@/app/actions/hr'

export function LeaveRequestActions({
  id, status, canApprove, approveLabel, rejectLabel,
}: {
  id: string
  status: string
  canApprove: boolean
  approveLabel: string
  rejectLabel: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!canApprove) {
    return <span className="text-[10px] text-[hsl(var(--muted-foreground))] italic">—</span>
  }

  function onApprove() {
    setError(null)
    startTransition(async () => {
      const r = await approveLeaveRequest(id)
      if (!r.ok) setError(r.error)
    })
  }
  function onReject() {
    const note = prompt('Reason for rejection? (optional)') ?? undefined
    setError(null)
    startTransition(async () => {
      const r = await rejectLeaveRequest(id, note || undefined)
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onApprove}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        {approveLabel}
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 disabled:opacity-60"
      >
        <X className="h-3 w-3" /> {rejectLabel}
      </button>
      {error && <span className="text-[10px] text-red-600 max-w-[120px] truncate" title={error}>{error}</span>}
    </div>
  )
}
