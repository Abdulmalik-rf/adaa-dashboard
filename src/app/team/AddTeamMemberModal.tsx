"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, X, UserPlus, Briefcase, Mail, Phone, ShieldCheck, Banknote, KeyRound, Copy, Check } from "lucide-react"
import { createTeamMember } from "@/app/actions/team"

type Credentials = { email: string; password: string }

export function AddTeamMemberModal({ t }: { t: any }) {
  const [isOpen, setIsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [copiedField, setCopiedField] = useState<'email' | 'password' | 'both' | null>(null)

  function reset() {
    setIsOpen(false)
    setSubmitting(false)
    setError(null)
    setCredentials(null)
    setCopiedField(null)
  }

  async function copy(text: string, field: 'email' | 'password' | 'both') {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      /* ignore */
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const formData = new FormData(e.currentTarget)
      const result = await createTeamMember(formData)
      if (!result.ok) {
        setError(result.error)
      } else if (result.credentials) {
        // Show the credentials panel — admin must copy before closing
        setCredentials(result.credentials)
        if (result.warning) setError(result.warning)
      } else {
        // No login created (checkbox off) — just close
        reset()
      }
    } catch (err: any) {
      setError(err?.message ?? 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="mx-2 h-4 w-4" /> {t.addTeamMember}
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white text-gray-900 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold flex items-center gap-2">
            {credentials ? (
              <>
                <KeyRound className="h-5 w-5 text-primary" /> Login created
              </>
            ) : (
              <>
                <UserPlus className="h-5 w-5 text-primary" /> {t.addTeamMember}
              </>
            )}
          </h2>
          <button onClick={reset} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {credentials ? (
          /* ============ CREDENTIALS PANEL (post-create) ============ */
          <div className="p-6 space-y-4">
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 p-4">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                ⚠ Save these now — the password won&apos;t be shown again
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Copy and send them to the team member through a secure channel
                (WhatsApp / signed email). Hitting Done closes this dialog and the
                password becomes unrecoverable (you&apos;d need to use Reset on
                the row to issue a new one).
              </p>
            </div>

            <div className="space-y-3">
              <CredentialField
                label="Email"
                value={credentials.email}
                onCopy={() => copy(credentials.email, 'email')}
                copied={copiedField === 'email'}
              />
              <CredentialField
                label="Password"
                value={credentials.password}
                onCopy={() => copy(credentials.password, 'password')}
                copied={copiedField === 'password'}
                mono
              />
            </div>

            <div className="pt-2 flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => copy(`Email: ${credentials.email}\nPassword: ${credentials.password}`, 'both')}
              >
                {copiedField === 'both' ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copiedField === 'both' ? 'Copied' : 'Copy both'}
              </Button>
              <Button type="button" className="flex-1 bg-primary text-white" onClick={reset}>
                Done
              </Button>
            </div>

            {error && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                Note: {error}
              </p>
            )}
          </div>
        ) : (
          /* ============ CREATE FORM ============ */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">{t.contactPerson}</label>
              <div className="relative">
                <UserPlus className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input name="full_name" required className="w-full p-2.5 pl-10 border rounded-xl bg-gray-50 text-gray-900" placeholder="Full Name" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">{t.jobTitle}</label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input name="job_title" className="w-full p-2.5 pl-10 border rounded-xl bg-gray-50 text-gray-900" placeholder="Manager" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">{t.role}</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <select name="role" className="w-full p-2.5 pl-10 border rounded-xl bg-gray-50 text-gray-900 text-sm appearance-none">
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="employee">Employee</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">{t.emailAddress}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input name="email" type="email" required className="w-full p-2.5 pl-10 border rounded-xl bg-gray-50 text-gray-900" placeholder="email@agency.com" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">{t.phoneNumber}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input name="phone" className="w-full p-2.5 pl-10 border rounded-xl bg-gray-50 text-gray-900" placeholder="+966" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2 col-span-2">
                <label className="text-sm font-semibold">Monthly salary</label>
                <div className="relative">
                  <Banknote className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input name="salary" type="number" min="0" step="0.01" className="w-full p-2.5 pl-10 border rounded-xl bg-gray-50 text-gray-900" placeholder="e.g. 5000" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Currency</label>
                <select name="salary_currency" defaultValue="SAR" className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900 text-sm appearance-none">
                  <option value="SAR">SAR</option>
                  <option value="USD">USD</option>
                  <option value="AED">AED</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            {/* === LOGIN CHECKBOX === */}
            <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 cursor-pointer hover:border-primary/50 transition-colors">
              <input
                type="checkbox"
                name="create_login"
                defaultChecked
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-primary" /> Create login account
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Generates a password and grants dashboard access at the role above. You&apos;ll see the credentials once.
                </p>
              </div>
            </label>

            <input type="hidden" name="status" value="active" />

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="pt-2 flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={reset} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 bg-primary text-white" disabled={submitting}>
                {submitting ? 'Creating…' : 'Save Member'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function CredentialField({
  label,
  value,
  onCopy,
  copied,
  mono,
}: {
  label: string
  value: string
  onCopy: () => void
  copied: boolean
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 border-gray-200 bg-gray-50 dark:bg-gray-900 px-3 py-2.5">
        <span className={`flex-1 text-sm text-gray-900 ${mono ? 'font-mono' : ''} truncate`}>
          {value}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold hover:bg-white dark:hover:bg-gray-800 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
