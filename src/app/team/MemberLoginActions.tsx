"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { KeyRound, Send, X, Copy, Check } from "lucide-react"
import { resetTeamMemberPassword } from "@/app/actions/team"

type Credentials = { email: string; password: string }

/**
 * Two roles in one component:
 *  - When the team_members row has NO `user_id`, the button reads
 *    "Send invite" and triggers resetTeamMemberPassword which (on
 *    its first call for that member) creates the auth user + profile
 *    and returns initial credentials.
 *  - When `user_id` already exists, the button reads "Reset password"
 *    and re-issues the password.
 *  - Either way, we show a copy-once panel with the credentials.
 */
export function MemberLoginActions({
  memberId,
  hasUserId,
  memberName,
}: {
  memberId: string
  hasUserId: boolean
  memberName: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [copied, setCopied] = useState<'email' | 'password' | 'both' | null>(null)

  async function handleClick() {
    const verb = hasUserId ? 'reset the password for' : 'create a login for'
    if (!confirm(`${hasUserId ? 'Reset password' : 'Send invite'}: ${verb} ${memberName}? You'll see the password once.`)) return
    setBusy(true)
    setError(null)
    try {
      const result = await resetTeamMemberPassword(memberId)
      if (!result.ok) setError(result.error)
      else setCredentials(result.credentials!)
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string, field: 'email' | 'password' | 'both') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(field)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* ignore */ }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title={hasUserId ? 'Reset password' : 'Send invite'}
        onClick={handleClick}
        disabled={busy}
      >
        {hasUserId ? (
          <KeyRound className="h-4 w-4 text-amber-500" />
        ) : (
          <Send className="h-4 w-4 text-[hsl(var(--primary))]" />
        )}
      </Button>

      {(credentials || error) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-950 w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b dark:border-gray-800">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[hsl(var(--primary))]" />
                {credentials ? 'Login credentials' : 'Error'}
              </h2>
              <button
                onClick={() => { setCredentials(null); setError(null); setCopied(null) }}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="rounded-xl border-2 border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 p-4 text-sm text-red-800 dark:text-red-200">
                  {error}
                </div>
              )}

              {credentials && (
                <>
                  <div className="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 p-4">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                      ⚠ Save these now — the password won&apos;t be shown again
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Send to {memberName} via WhatsApp / signed email. Hitting Done makes the password unrecoverable; you&apos;d need to Reset to issue a new one.
                    </p>
                  </div>

                  <CredentialField
                    label="Email"
                    value={credentials.email}
                    copied={copied === 'email'}
                    onCopy={() => copy(credentials.email, 'email')}
                  />
                  <CredentialField
                    label="Password"
                    value={credentials.password}
                    copied={copied === 'password'}
                    onCopy={() => copy(credentials.password, 'password')}
                    mono
                  />

                  <div className="pt-2 flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => copy(`Email: ${credentials.email}\nPassword: ${credentials.password}`, 'both')}
                    >
                      {copied === 'both' ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                      {copied === 'both' ? 'Copied' : 'Copy both'}
                    </Button>
                    <Button
                      className="flex-1 bg-primary text-white"
                      onClick={() => { setCredentials(null); setCopied(null) }}
                    >
                      Done
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CredentialField({
  label, value, copied, onCopy, mono,
}: {
  label: string; value: string; copied: boolean; onCopy: () => void; mono?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-2.5">
        <span className={`flex-1 text-sm text-gray-900 dark:text-gray-100 ${mono ? 'font-mono' : ''} truncate`}>{value}</span>
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
