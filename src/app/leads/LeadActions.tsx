'use client'

import { useState, useTransition } from 'react'
import { Check, ArrowUpRight, Loader2 } from 'lucide-react'
import { markLeadContacted, promoteLeadToClient } from '@/app/actions/clients'

// Per-row buttons for the /leads table. Two actions:
//   • Mark contacted — stamps last_contacted_at + bumps to_contact → lead,
//     logs a communication_logs row so the touch is auditable
//   • Promote — flips status → active and moves the row to /clients
// Both run as React transitions so the button text shows progress and
// the page revalidates on success.
export function LeadActions({
  leadId,
  markContactedLabel,
  promoteLabel,
  promoteHint,
}: {
  leadId: string
  markContactedLabel: string
  promoteLabel: string
  promoteHint: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onMark() {
    setError(null)
    startTransition(async () => {
      const r = await markLeadContacted(leadId, undefined, undefined)
      if (!r.ok) setError(r.error)
    })
  }

  function onPromote() {
    setError(null)
    if (!confirm(promoteHint + '?')) return
    startTransition(async () => {
      const r = await promoteLeadToClient(leadId)
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onMark}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        {markContactedLabel}
      </button>
      <button
        type="button"
        onClick={onPromote}
        disabled={pending}
        title={promoteHint}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-[hsl(var(--primary))] text-white hover:opacity-90 shadow-sm shadow-[hsl(var(--primary)/0.25)] disabled:opacity-60"
      >
        <ArrowUpRight className="h-3 w-3" />
        {promoteLabel}
      </button>
      {error && (
        <span className="text-[10px] text-red-600 max-w-[120px] truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  )
}
