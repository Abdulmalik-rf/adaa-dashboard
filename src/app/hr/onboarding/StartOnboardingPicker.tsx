'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Play } from 'lucide-react'
import { startOnboardingChecklist } from '@/app/actions/hr-automation'

export function StartOnboardingPicker({
  eligible,
  ar,
  title,
}: {
  eligible: Array<{ id: string; full_name: string; hire_date: string | null; employment_type?: string | null; nationality?: string | null }>
  ar: boolean
  title: string
}) {
  const router = useRouter()
  const [employeeId, setEmployeeId] = useState('')
  const [template, setTemplate] = useState<string>('')
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function go() {
    if (!employeeId) { setErr(ar ? 'اختر موظفاً' : 'Pick an employee'); return }
    setErr(null); setInfo(null)
    startTransition(async () => {
      const r = await startOnboardingChecklist({ employee_id: employeeId, template: template || undefined })
      if (!r.ok) setErr(r.error)
      else { setInfo(`✓ ${r.items} items created`); setEmployeeId(''); setTemplate(''); router.refresh() }
    })
  }

  if (eligible.length === 0) return null

  return (
    <div className="premium-card p-4">
      <h3 className="font-bold text-sm uppercase tracking-wider mb-3">{title}</h3>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{ar ? 'الموظف' : 'Employee'}</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm">
            <option value="">— {ar ? 'اختر' : 'Pick one'} —</option>
            {eligible.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}{e.hire_date ? ` · hired ${e.hire_date}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px]">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{ar ? 'القالب (اختياري)' : 'Template (auto)'}</label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm">
            <option value="">— auto —</option>
            <option value="saudi_full_time">Saudi · full time</option>
            <option value="expat_full_time">Expat · full time</option>
            <option value="part_time">Part time</option>
            <option value="intern">Intern</option>
            <option value="contractor">Contractor</option>
          </select>
        </div>
        <button onClick={go} disabled={pending} className="btn btn-primary inline-flex items-center gap-1.5">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {ar ? 'بدء' : 'Start'}
        </button>
        {info && <span className="text-xs text-emerald-600 font-semibold">{info}</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  )
}
