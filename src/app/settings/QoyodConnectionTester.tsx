'use client'

import { useState, useTransition } from 'react'
import { Loader2, CheckCircle2, XCircle, Zap } from 'lucide-react'
import { testQoyodConnection } from '@/app/actions/invoices'

export function QoyodConnectionTester({ hasKey }: { hasKey: boolean }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<null | { ok: true; accounts: number; inventories?: number } | { ok: false; error: string }>(null)

  function run() {
    setResult(null)
    startTransition(async () => {
      const r = await testQoyodConnection()
      setResult(r)
    })
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending || !hasKey}
        title={!hasKey ? 'Save the API key first' : 'Hit /accounts to confirm the key works'}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
        Test connection
      </button>
      {result?.ok && (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Connected — {result.accounts} accounts{result.inventories ? `, ${result.inventories} inventories` : ''}
        </span>
      )}
      {result && !result.ok && (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 max-w-md truncate" title={result.error}>
          <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {result.error}
        </span>
      )}
    </div>
  )
}
