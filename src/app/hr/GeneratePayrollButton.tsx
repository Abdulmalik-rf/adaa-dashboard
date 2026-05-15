'use client'

import { useState, useTransition } from 'react'
import { Banknote, Loader2 } from 'lucide-react'
import { generatePayrollForMonth } from '@/app/actions/hr'

export function GeneratePayrollButton({ year, month, label }: { year: number; month: number; label: string }) {
  const [pending, startTransition] = useTransition()
  const [info, setInfo] = useState<string | null>(null)

  function onClick() {
    setInfo(null)
    startTransition(async () => {
      const r = await generatePayrollForMonth({ year, month })
      if (!r.ok) setInfo(`✗ ${r.error}`)
      else setInfo(`✓ ${r.period}: ${r.created} created, ${r.skipped} already existed`)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="btn btn-primary text-sm flex items-center gap-2 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
        {label}
      </button>
      {info && <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{info}</span>}
    </div>
  )
}
