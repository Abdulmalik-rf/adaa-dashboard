'use client'

import { useState, useTransition } from 'react'
import { Loader2, Sparkles, Copy } from 'lucide-react'
import { buildPerformanceBrief } from '@/app/actions/hr-automation'

export function PerformanceBriefBuilder({
  employees,
  ar,
}: {
  employees: Array<{ id: string; full_name: string; job_title?: string | null }>
  ar: boolean
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [days, setDays] = useState(30)
  const [pending, startTransition] = useTransition()
  const [brief, setBrief] = useState<string>('')
  const [metrics, setMetrics] = useState<Record<string, any> | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function go() {
    if (!employeeId) { setErr(ar ? 'اختر موظفاً' : 'Pick an employee'); return }
    setErr(null); setBrief(''); setMetrics(null)
    startTransition(async () => {
      const r = await buildPerformanceBrief({ employee_id: employeeId, days })
      if (!r.ok) setErr(r.error)
      else { setBrief(r.brief); setMetrics(r.metrics) }
    })
  }

  function copy() {
    navigator.clipboard.writeText(brief).catch(() => {})
  }

  return (
    <>
      <div className="premium-card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{ar ? 'الموظف' : 'Employee'}</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm">
            <option value="">— {ar ? 'اختر' : 'Pick'} —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name}{e.job_title ? ` · ${e.job_title}` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{ar ? 'الفترة (أيام)' : 'Window (days)'}</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm">
            <option value={7}>7</option>
            <option value={14}>14</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
            <option value={90}>90</option>
            <option value={180}>180</option>
          </select>
        </div>
        <button onClick={go} disabled={pending} className="btn btn-primary inline-flex items-center gap-1.5">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {ar ? 'إنشاء التقرير' : 'Build brief'}
        </button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      {brief && (
        <div className="premium-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] flex items-center justify-between">
            <h3 className="font-bold text-sm uppercase tracking-wider">{ar ? 'التقرير' : 'Brief'}</h3>
            <button onClick={copy} className="btn btn-ghost btn-xs inline-flex items-center gap-1">
              <Copy className="h-3 w-3" /> {ar ? 'نسخ' : 'Copy'}
            </button>
          </div>
          <pre className="p-4 text-sm whitespace-pre-wrap break-words font-sans leading-relaxed">{brief}</pre>
        </div>
      )}

      {metrics && (
        <div className="premium-card p-4">
          <h3 className="font-bold text-xs uppercase tracking-wider mb-3 text-[hsl(var(--muted-foreground))]">{ar ? 'الأرقام الخام' : 'Raw metrics'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {Object.entries(metrics).map(([k, v]) => (
              <div key={k} className="bg-[hsl(var(--muted)/0.3)] rounded p-2">
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] font-bold">{k.replace(/_/g, ' ')}</p>
                <p className="font-bold text-sm mt-0.5">{Array.isArray(v) ? (v.length === 0 ? '—' : v.join(', ')) : String(v)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
