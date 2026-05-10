'use client'

import { useState, useTransition } from 'react'
import { loginAction, signupAction, requestAdminVerificationCode, signupAsAdminAction } from './actions'

type Mode = 'signin' | 'signup' | 'admin'

export function LoginForm({ signupSuccess }: { signupSuccess?: boolean }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [codeSent, setCodeSent] = useState(false)
  const [requestingCode, setRequestingCode] = useState(false)
  const [adminEmailDraft, setAdminEmailDraft] = useState('')
  const [isPending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      let result: any
      if (mode === 'signin') result = await loginAction(formData)
      else if (mode === 'signup') result = await signupAction(formData)
      else if (mode === 'admin') result = await signupAsAdminAction(formData)
      if (result && 'error' in result && result.error) setError(result.error)
    })
  }

  async function handleRequestCode() {
    setError(null)
    setInfo(null)
    setRequestingCode(true)
    try {
      const result = await requestAdminVerificationCode(adminEmailDraft || undefined)
      if (!result?.ok) {
        setError(result?.error || 'Could not send verification code (no error message returned).')
      } else {
        setCodeSent(true)
        setInfo(
          result.warning
            ? `Code generated. ${result.warning}`
            : 'Code sent to the agency owner. Check the inbox (and spam) for the 6-digit code, then enter it below to finish creating the admin account.',
        )
      }
    } catch (e: any) {
      // Server action threw — surface it instead of silently failing.
      const msg = e?.message || (typeof e === 'string' ? e : null) || 'Unexpected error sending verification code. Check console for details.'
      setError(msg)
      console.error('[admin-signup] requestAdminVerificationCode threw:', e)
    } finally {
      setRequestingCode(false)
    }
  }

  function switchMode(m: Mode) {
    setMode(m)
    setError(null)
    setInfo(null)
    setCodeSent(false)
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-8 pt-10 pb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/emergize-logo.png"
            alt="Emergize"
            className="mx-auto h-14 w-auto object-contain dark:invert"
          />
          <p className="mt-4 text-xs tracking-[0.2em] uppercase font-semibold text-lime-600 dark:text-lime-400">
            Emerge to Dominate
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {mode === 'signin' && 'Sign in to your account'}
            {mode === 'signup' && 'Create a user account'}
            {mode === 'admin' && 'Create an admin account (verification required)'}
          </p>
        </div>

        <div className="px-8 pb-8">
          {signupSuccess && mode === 'signin' && (
            <div className="mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              Account created. Check your email to confirm (if required) then sign in.
            </div>
          )}

          {/* Three-tab segmented control */}
          <div className="grid grid-cols-3 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 mb-6 gap-1">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`py-2 text-xs font-medium rounded-md transition ${
                mode === 'signin'
                  ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`py-2 text-xs font-medium rounded-md transition ${
                mode === 'signup'
                  ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => switchMode('admin')}
              className={`py-2 text-xs font-medium rounded-md transition flex items-center justify-center gap-1 ${
                mode === 'admin'
                  ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Admin
            </button>
          </div>

          {/* Admin-mode banner explaining the verification flow */}
          {mode === 'admin' && !codeSent && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <strong>Admin signup is gated.</strong> Step 1 — fill in your email below and click <em>Send Verification Code</em>. A 6-digit code will be emailed to the agency owner&apos;s inbox. Step 2 — enter the code with your password and full name to finish.
            </div>
          )}

          <form action={onSubmit} className="space-y-4">
            {(mode === 'signup' || mode === 'admin') && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full name
                </label>
                <input
                  type="text"
                  name="full_name"
                  placeholder="Jane Doe"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={mode === 'admin' ? adminEmailDraft : undefined}
                onChange={mode === 'admin' ? (e) => setAdminEmailDraft(e.target.value) : undefined}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
              />
            </div>

            {/* Step-1 / Step-2 split for admin mode */}
            {mode === 'admin' && !codeSent && (
              <button
                type="button"
                onClick={handleRequestCode}
                disabled={requestingCode || !adminEmailDraft}
                className="w-full h-10 rounded-lg bg-amber-500 text-white text-sm font-semibold shadow hover:bg-amber-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {requestingCode ? 'Sending code…' : 'Send Verification Code'}
              </button>
            )}

            {(mode === 'signin' || mode === 'signup' || (mode === 'admin' && codeSent)) && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={mode !== 'signin' ? 8 : undefined}
                  placeholder="••••••••"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
            )}

            {mode === 'admin' && codeSent && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Verification code (6 digits)
                </label>
                <input
                  type="text"
                  name="verification_code"
                  required
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="123456"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500 font-mono tracking-[0.4em] text-center"
                />
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={requestingCode}
                  className="mt-1 text-xs text-lime-600 dark:text-lime-400 hover:underline disabled:opacity-60"
                >
                  {requestingCode ? 'Resending…' : 'Resend code'}
                </button>
              </div>
            )}

            {info && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
                {info}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {/* Final submit — only shown when there's a real form to submit */}
            {(mode === 'signin' || mode === 'signup' || (mode === 'admin' && codeSent)) && (
              <button
                type="submit"
                disabled={isPending}
                className="w-full h-10 rounded-lg bg-gradient-to-r from-lime-400 to-zinc-900 text-zinc-900 text-sm font-semibold shadow hover:shadow-md transition disabled:opacity-60"
              >
                {isPending
                  ? 'Please wait…'
                  : mode === 'signin'
                    ? 'Sign in'
                    : mode === 'admin'
                      ? 'Create Admin Account'
                      : 'Create account'}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
