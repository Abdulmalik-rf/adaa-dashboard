'use client'

import { useState, useTransition } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import { approveLoanRequest, rejectLoanRequest } from '@/app/actions/hr-automation'
import { useRouter } from 'next/navigation'

export function LoanRow({
  loan, ar, statusBadge, statusLabel,
}: {
  loan: any
  ar: boolean
  statusBadge: Record<string, string>
  statusLabel: Record<string, string>
}) {
  const router = useRouter()
  const [pendingA, startA] = useTransition()
  const [pendingR, startR] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function approve() {
    setErr(null)
    startA(async () => {
      const r = await approveLoanRequest({ loan_id: loan.id })
      if (!r.ok) setErr(r.error)
      else router.refresh()
    })
  }
  function reject() {
    const note = prompt(ar ? 'سبب الرفض؟' : 'Reason for rejection?') ?? ''
    if (!note.trim()) return
    setErr(null)
    startR(async () => {
      const r = await rejectLoanRequest({ loan_id: loan.id, decision_note: note.trim() })
      if (!r.ok) setErr(r.error)
      else router.refresh()
    })
  }

  const canAct = loan.status === 'submitted'
  const emp = loan.team_members
  const monthLabel = `${loan.first_deduction_year}-${String(loan.first_deduction_month).padStart(2, '0')}`

  return (
    <tr className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
      <td className="px-3 py-2">
        <p className="font-semibold text-sm">{emp?.full_name ?? '—'}{emp?.full_name_ar ? <span className="text-[hsl(var(--muted-foreground))]"> · {emp.full_name_ar}</span> : ''}</p>
        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{emp?.job_title ?? '—'}{emp?.base_salary ? ` · ${Number(emp.base_salary).toLocaleString('en-US')} ${emp.salary_currency || 'SAR'}/mo` : ''}</p>
      </td>
      <td className="px-3 py-2 text-right font-bold">{Number(loan.amount).toLocaleString('en-US')} {loan.currency}</td>
      <td className="px-3 py-2 text-right text-xs">{loan.term_months}m</td>
      <td className="px-3 py-2 text-right text-xs font-semibold">{Number(loan.monthly_deduction).toLocaleString('en-US')}</td>
      <td className="px-3 py-2 text-xs">{monthLabel}</td>
      <td className="px-3 py-2 text-xs max-w-[180px] truncate" title={loan.reason || ''}>{loan.reason || '—'}</td>
      <td className="px-3 py-2">
        <span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusBadge[loan.status] || statusBadge.submitted}`}>
          {statusLabel[loan.status] ?? loan.status}
        </span>
        {loan.decision_note && (
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1 max-w-[200px] truncate" title={loan.decision_note}>
            {loan.decision_note}
          </p>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {canAct ? (
          <div className={`inline-flex items-center gap-1.5 ${ar ? 'flex-row-reverse' : ''}`}>
            <button onClick={approve} disabled={pendingA || pendingR} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60">
              {pendingA ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {ar ? 'موافق' : 'Approve'}
            </button>
            <button onClick={reject} disabled={pendingA || pendingR} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 disabled:opacity-60">
              {pendingR ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              {ar ? 'رفض' : 'Reject'}
            </button>
          </div>
        ) : <span className="text-[10px] text-[hsl(var(--muted-foreground))] italic">—</span>}
        {err && <p className="text-[10px] text-red-600 mt-1 max-w-[160px] truncate" title={err}>{err}</p>}
      </td>
    </tr>
  )
}
