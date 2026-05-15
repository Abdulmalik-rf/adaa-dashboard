'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { Plus, X, Send, Loader2 } from 'lucide-react'
import { requestLeave } from '@/app/actions/hr'

type EmpLite = { id: string; full_name: string; annual_leave_balance: number }

export function RequestLeaveButton({
  employees,
  label,
  noEmpsHint,
  isRtl,
}: {
  employees: EmpLite[]
  label: string
  noEmpsHint: string
  isRtl: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (employees.length === 0) {
    return <span className="text-[11px] text-amber-700 dark:text-amber-400 italic max-w-xs">{noEmpsHint}</span>
  }

  function close() { setOpen(false); setError(null); setOk(false) }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const r = await requestLeave({
        employee_id: String(f.get('employee_id') || ''),
        type: String(f.get('type') || 'annual') as any,
        start_date: String(f.get('start_date') || ''),
        end_date: String(f.get('end_date') || ''),
        reason: String(f.get('reason') || '') || undefined,
      })
      if (!r.ok) setError(r.error)
      else { setOk(true); setTimeout(close, 800) }
    })
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary text-sm flex items-center gap-2">
        <Plus className="h-4 w-4" /> {label}
      </button>
      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="bg-white text-gray-900 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold">{label}</h3>
              <button onClick={close} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={onSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Employee</label>
                <select name="employee_id" required className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-900 text-sm">
                  <option value="">Select…</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name} · balance {e.annual_leave_balance}d</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Type</label>
                <select name="type" defaultValue="annual" className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-900 text-sm">
                  <option value="annual">Annual</option>
                  <option value="sick">Sick</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="personal">Personal</option>
                  <option value="maternity">Maternity</option>
                  <option value="paternity">Paternity</option>
                  <option value="bereavement">Bereavement</option>
                  <option value="hajj">Hajj</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1">Start</label>
                  <input type="date" name="start_date" required className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-900 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">End</label>
                  <input type="date" name="end_date" required className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-900 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Reason (optional)</label>
                <textarea name="reason" rows={3} className="w-full p-2.5 border border-gray-300 rounded-xl bg-gray-50 text-gray-900 text-sm resize-none" />
              </div>
              {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
              {ok && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">Submitted ✓</div>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={close} className="btn btn-secondary text-sm">Cancel</button>
                <button type="submit" disabled={pending} className="btn btn-primary text-sm flex items-center gap-2">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
