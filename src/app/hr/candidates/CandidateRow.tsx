'use client'

import { useState, useTransition } from 'react'
import { ExternalLink, Loader2, Star, UserCheck } from 'lucide-react'
import { promoteCandidateToEmployee, updateCandidate } from '@/app/actions/hr-automation'
import { useRouter } from 'next/navigation'

export function CandidateRow({
  c, ar, statusBadge, statusLabel,
}: {
  c: any
  ar: boolean
  statusBadge: Record<string, string>
  statusLabel: Record<string, string>
}) {
  const router = useRouter()
  const [pendingS, startStatus] = useTransition()
  const [pendingR, startRate] = useTransition()
  const [pendingP, startPromote] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function changeStatus(next: string) {
    setErr(null)
    startStatus(async () => {
      const r = await updateCandidate({ id: c.id, status: next })
      if (!r.ok) setErr(r.error)
      else router.refresh()
    })
  }
  function rate(n: number) {
    setErr(null)
    startRate(async () => {
      const r = await updateCandidate({ id: c.id, rating: n })
      if (!r.ok) setErr(r.error)
      else router.refresh()
    })
  }
  function promote() {
    if (!confirm(ar ? `ترقية ${c.full_name} إلى موظف؟ سيتم إنشاء team_member وقائمة توظيف.` : `Promote ${c.full_name} to employee? This creates a team_member + onboarding checklist.`)) return
    setErr(null)
    startPromote(async () => {
      const r = await promoteCandidateToEmployee({ candidate_id: c.id })
      if (!r.ok) setErr(r.error)
      else router.refresh()
    })
  }

  return (
    <tr className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
      <td className="px-3 py-2">
        <p className="font-semibold text-sm">{c.full_name}</p>
        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{c.email || c.phone || '—'}</p>
      </td>
      <td className="px-3 py-2 text-xs">
        {c.current_title || '—'}
        {c.current_city ? <span className="text-[hsl(var(--muted-foreground))]"> · {c.current_city}</span> : ''}
      </td>
      <td className="px-3 py-2 text-right text-xs font-semibold">{c.years_experience != null ? `${c.years_experience}y` : '—'}</td>
      <td className="px-3 py-2 text-right text-xs font-bold">{c.asking_salary ? `${Number(c.asking_salary).toLocaleString('en-US')} ${c.salary_currency || 'SAR'}` : '—'}</td>
      <td className="px-3 py-2">
        <select
          value={c.status}
          onChange={(e) => changeStatus(e.target.value)}
          disabled={pendingS}
          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border-0 ${statusBadge[c.status] || statusBadge.new}`}>
          {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        <div className={`inline-flex gap-0.5 ${ar ? 'flex-row-reverse' : ''}`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => rate(n)} disabled={pendingR}>
              <Star className={`h-3.5 w-3.5 ${c.rating && c.rating >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />
            </button>
          ))}
        </div>
      </td>
      <td className="px-3 py-2">
        {c.cv_url ? (
          <a href={c.cv_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <ExternalLink className="h-3 w-3" /> CV
          </a>
        ) : <span className="text-[10px] text-[hsl(var(--muted-foreground))]">—</span>}
      </td>
      <td className="px-3 py-2 text-right">
        {c.status !== 'hired' && (
          <button
            onClick={promote}
            disabled={pendingP}
            title={ar ? 'ترقية إلى موظف' : 'Promote to employee'}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60">
            {pendingP ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
            {ar ? 'ترقية' : 'Promote'}
          </button>
        )}
        {err && <p className="text-[10px] text-red-600 mt-1 max-w-[120px] truncate" title={err}>{err}</p>}
      </td>
    </tr>
  )
}
