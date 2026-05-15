'use client'

import { useState, useTransition } from 'react'
import { Banknote, Loader2, Sparkles } from 'lucide-react'
import { generatePayrollForMonth } from '@/app/actions/hr'
import { generateAutoPayroll } from '@/app/actions/hr-automation'

export function GeneratePayrollButton({ year, month, label }: { year: number; month: number; label: string }) {
  const [pending, startTransition] = useTransition()
  const [info, setInfo] = useState<string | null>(null)
  const [autoPending, startAuto] = useTransition()

  function onClick() {
    setInfo(null)
    startTransition(async () => {
      const r = await generatePayrollForMonth({ year, month })
      if (!r.ok) setInfo(`✗ ${r.error}`)
      else setInfo(`✓ ${r.period}: ${r.created} created, ${r.skipped} already existed`)
    })
  }

  // The "smart" variant applies KSA rules: GOSI (9% Saudi / 0% expat),
  // unpaid-leave proration, EOSB accrual line, allowances. Overwrites pending
  // rows; leaves paid rows alone.
  function onSmart() {
    setInfo(null)
    startAuto(async () => {
      const r = await generateAutoPayroll({ year, month })
      if (!r.ok) setInfo(`✗ ${r.error}`)
      else setInfo(`✓ ${r.period}: ${r.generated} row(s) with KSA rules applied`)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSmart}
          disabled={autoPending || pending}
          title="Apply GOSI + unpaid-leave + EOSB rules"
          className="btn btn-primary text-sm flex items-center gap-2 disabled:opacity-60"
        >
          {autoPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {label}
        </button>
        <button
          type="button"
          onClick={onClick}
          disabled={pending || autoPending}
          title="Legacy: flat-salary copy only"
          className="btn btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Banknote className="h-3 w-3" />}
          Flat
        </button>
      </div>
      {info && <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{info}</span>}
    </div>
  )
}
