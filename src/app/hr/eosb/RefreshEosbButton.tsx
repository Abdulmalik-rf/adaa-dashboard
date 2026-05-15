'use client'

import { useTransition, useState } from 'react'
import { Loader2, RefreshCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { refreshEosbSnapshot } from '@/app/actions/hr-automation'

export function RefreshEosbButton({ label }: { label: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  function go() {
    setErr(null); setInfo(null)
    startTransition(async () => {
      const r = await refreshEosbSnapshot({})
      if (!r.ok) setErr(r.error)
      else { setInfo(`✓ ${r.rows} snapshots refreshed`); router.refresh() }
    })
  }
  return (
    <div className="inline-flex items-center gap-2">
      <button onClick={go} disabled={pending} className="btn btn-secondary inline-flex items-center gap-1.5 text-sm">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
        {label}
      </button>
      {info && <span className="text-xs text-emerald-600 font-semibold">{info}</span>}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  )
}
