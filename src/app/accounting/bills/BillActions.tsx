'use client'

import { useState, useTransition } from 'react'
import { Check, Send, X, ExternalLink, Loader2 } from 'lucide-react'
import { approveBill, voidBill, pushBillToQoyod } from '@/app/actions/bills'

export function BillActions({
  billId, status, externalUrl, ar,
}: {
  billId: string
  status: string
  externalUrl?: string | null
  ar: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null)
    startTransition(async () => {
      const r = await fn()
      if (!r.ok && r.error) setErr(r.error)
    })
  }

  return (
    <>
      {status === 'draft' && (
        <button onClick={() => run(() => approveBill(billId))} disabled={pending}
          title={ar ? 'اعتماد' : 'Approve'}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60">
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {ar ? 'اعتماد' : 'Approve'}
        </button>
      )}
      {(status === 'approved' || status === 'failed') && (
        <button onClick={() => run(() => pushBillToQoyod(billId))} disabled={pending}
          title={ar ? 'إرسال إلى قيود' : 'Push to Qoyod'}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-60">
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          {ar ? 'إرسال' : 'Push'}
        </button>
      )}
      {(status === 'pushed' || status === 'paid') && externalUrl && (
        <a href={externalUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/30">
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {status === 'draft' && (
        <button onClick={() => {
          if (!confirm(ar ? 'إلغاء هذه المسودة؟' : 'Void this draft?')) return
          run(() => voidBill(billId))
        }} disabled={pending} title={ar ? 'إلغاء' : 'Void'}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 disabled:opacity-60">
          <X className="h-3 w-3" />
        </button>
      )}
      {err && <span className="text-[10px] text-red-600 max-w-[160px] truncate ml-2" title={err}>{err}</span>}
    </>
  )
}
