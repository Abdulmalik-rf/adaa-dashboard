'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { markPayrollPaid } from '@/app/actions/hr'

export function PayrollActions({ id, status, paidLabel }: { id: string; status: string; paidLabel: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (status === 'paid' || status === 'cancelled') {
    return <span className="text-[10px] text-[hsl(var(--muted-foreground))] italic">—</span>
  }

  function onPay() {
    const method = prompt('Payment method? (bank_transfer / cash / cheque)', 'bank_transfer') ?? undefined
    setError(null)
    startTransition(async () => {
      const r = await markPayrollPaid(id, method || 'bank_transfer')
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onPay}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        {`Mark ${paidLabel.toLowerCase()}`}
      </button>
      {error && <span className="text-[10px] text-red-600 max-w-[120px] truncate" title={error}>{error}</span>}
    </div>
  )
}
