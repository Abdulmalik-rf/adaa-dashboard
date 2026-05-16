'use client'

// Inline role-editor pill in the /team table. Admin only — server action
// enforces it; non-admins see disabled select.

import { useState, useTransition } from 'react'
import { Shield, Loader2, Check } from 'lucide-react'
import { updateTeamMemberRole } from '@/app/actions/team'
import { useRouter } from 'next/navigation'

const ROLES = [
  { value: 'admin',   label: 'Admin',   color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  { value: 'hr',      label: 'HR',      color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'finance', label: 'Finance', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { value: 'manager', label: 'Manager', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'staff',   label: 'Staff',   color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
]

export function RoleSelect({ memberId, currentRole }: { memberId: string; currentRole: string }) {
  const router = useRouter()
  const [role, setRole] = useState(currentRole)
  const [pending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function change(next: string) {
    if (next === role) return
    setErr(null)
    const prev = role
    setRole(next)
    startTransition(async () => {
      const r = await updateTeamMemberRole({ id: memberId, role: next })
      if (!r.ok) {
        setRole(prev)
        setErr(r.error)
      } else {
        setSavedAt(Date.now())
        router.refresh()
      }
    })
  }

  const cur = ROLES.find((r) => r.value === role) ?? ROLES[ROLES.length - 1]
  const savedRecent = savedAt && Date.now() - savedAt < 4000

  return (
    <div className="flex flex-col gap-1">
      <div className="relative inline-flex items-center gap-1">
        <Shield className="h-3 w-3 text-gray-400" />
        <select
          value={role}
          onChange={(e) => change(e.target.value)}
          disabled={pending}
          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border-0 ${cur.color} cursor-pointer disabled:opacity-60`}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        {pending && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
        {savedRecent && !pending && <Check className="h-3 w-3 text-emerald-600" />}
      </div>
      {err && <p className="text-[10px] text-red-600 max-w-[140px] truncate" title={err}>{err}</p>}
    </div>
  )
}
