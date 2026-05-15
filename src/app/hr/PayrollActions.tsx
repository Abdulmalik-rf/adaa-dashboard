'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Mail } from 'lucide-react'
import { markPayrollPaid } from '@/app/actions/hr'
import { sendSalarySlipEmail } from '@/app/actions/hr-automation'

export function PayrollActions({ id, status, paidLabel }: { id: string; status: string; paidLabel: string }) {
  const [pending, startTransition] = useTransition()
  const [slipPending, startSlip] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function onPay() {
    const method = prompt('Payment method? (bank_transfer / cash / cheque)', 'bank_transfer') ?? undefined
    setError(null)
    startTransition(async () => {
      const r = await markPayrollPaid(id, method || 'bank_transfer')
      if (!r.ok) setError(r.error)
    })
  }

  function onSendSlip() {
    setError(null); setInfo(null)
    startSlip(async () => {
      const r = await sendSalarySlipEmail({ payroll_id: id })
      if (!r.ok) setError(r.error)
      else setInfo('✓ Slip emailed')
    })
  }

  if (status === 'cancelled') {
    return <span className="text-[10px] text-[hsl(var(--muted-foreground))] italic">—</span>
  }

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {status !== 'paid' && (
        <button
          type="button"
          onClick={onPay}
          disabled={pending}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {`Mark ${paidLabel.toLowerCase()}`}
        </button>
      )}
      <button
        type="button"
        onClick={onSendSlip}
        disabled={slipPending}
        title="Send the bilingual salary slip via email"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/30 disabled:opacity-60"
      >
        {slipPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
        Slip
      </button>
      {info && <span className="text-[10px] text-emerald-600 font-semibold">{info}</span>}
      {error && <span className="text-[10px] text-red-600 max-w-[120px] truncate" title={error}>{error}</span>}
    </div>
  )
}
