'use client'

import { useTransition, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { finalizeReconciliation } from '@/app/actions/bank-reconciliation'

export function FinalizeButton({
  uploadId,
  ar,
  label,
}: {
  uploadId: string
  ar: boolean
  label: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function go() {
    if (!confirm(ar ? 'إنهاء التسوية؟ لا يمكن تعديل العمليات بعدها.' : 'Finalize reconciliation? Transactions become read-only after this.')) return
    setErr(null)
    startTransition(async () => {
      const r = await finalizeReconciliation(uploadId)
      if (!r.ok) setErr(r.error)
      else router.refresh()
    })
  }

  return (
    <>
      <button onClick={go} disabled={pending} className="btn btn-primary inline-flex items-center gap-2">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {label}
      </button>
      {err && <span className="text-xs text-red-600 ml-2">{err}</span>}
    </>
  )
}
