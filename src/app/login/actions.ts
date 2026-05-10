'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { agentSupabase } from '@/lib/chat-agent/supabase'
import { sendEmail } from '@/lib/email'

// Hard-coded so a misconfigured env var can't redirect verification codes
// to an attacker. To rotate the destination, ship a new build.
const ADMIN_VERIFICATION_EMAIL = 'abdulmalikalrifaee@outlook.com'

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  const { data: { user } } = await supabase.auth.getUser()
  let role: string = 'user'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    role = profile?.role || 'user'
  }

  revalidatePath('/', 'layout')
  redirect(role === 'admin' ? '/' : '/my-dashboard')
}

export async function signupAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const fullName = String(formData.get('full_name') || '').trim()

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role: 'user' },
    },
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/login?signup=success')
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

// =============================================================================
// ADMIN SIGNUP FLOW (verification-gated)
// =============================================================================
// Anyone visiting /login can hit "Create Admin" and trigger an email to the
// agency owner with a 6-digit code. They then enter the code along with
// their email/password/name to finish creating the admin account. Flow:
//
//   requestAdminVerificationCode()  → generates code, stores in DB,
//                                     emails it to ADMIN_VERIFICATION_EMAIL.
//                                     Rate-limited to prevent inbox spam.
//   signupAsAdminAction(formData)   → checks code is valid + unused,
//                                     creates auth user with role=admin in
//                                     both app_metadata and profiles,
//                                     marks code as used.

function generateCode(): string {
  // 6 digits, padded — easier for the user to type than a UUID
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function requestAdminVerificationCode(requestedForEmail?: string) {
  // Catch-all wrapper so the action ALWAYS returns a structured response
  // instead of throwing — otherwise a missing env var crashes silently
  // on the client without any error message reaching the UI.
  try {
    return await _requestAdminVerificationCodeInner(requestedForEmail)
  } catch (e: any) {
    const msg = e?.message || String(e) || 'Unknown error'
    console.error('[requestAdminVerificationCode] failed:', msg, e?.stack)
    return { ok: false, error: `Server error: ${msg}` }
  }
}

async function _requestAdminVerificationCodeInner(requestedForEmail?: string) {
  // Surface env-var problems early with a clear message instead of letting
  // agentSupabase() throw a generic error that's hard to interpret.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server. Add it in Hostinger panel → Environment Variables, then redeploy.',
    }
  }

  const supa = agentSupabase()

  // Rate limit: at most 3 codes per 10 min for the same destination email
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString()
  const { count, error: countErr } = await supa
    .from('admin_verification_codes')
    .select('*', { count: 'exact', head: true })
    .eq('email', ADMIN_VERIFICATION_EMAIL)
    .gte('created_at', tenMinAgo)
  if (countErr) {
    return { ok: false, error: 'Setup needed. Apply migration 013_admin_verification_codes.sql in Supabase SQL Editor first.' }
  }
  if ((count ?? 0) >= 3) {
    return { ok: false, error: 'Too many codes requested. Please wait a few minutes and try again.' }
  }

  const code = generateCode()
  const { error: insertErr } = await supa.from('admin_verification_codes').insert({
    code,
    email: ADMIN_VERIFICATION_EMAIL,
    requested_for_email: requestedForEmail ?? null,
  })
  if (insertErr) {
    return { ok: false, error: `Could not store code: ${insertErr.message}` }
  }

  const subject = 'Emergize — Admin signup verification code'
  const text =
    `Someone is trying to create an Emergize admin account.\n\n` +
    `Verification code: ${code}\n\n` +
    (requestedForEmail ? `Requested for: ${requestedForEmail}\n` : '') +
    `This code expires in 15 minutes.\n\n` +
    `If you didn't expect this, you can ignore this email — without the code, ` +
    `no admin account will be created.\n\n` +
    `— Emergize`
  const sent = await sendEmail({
    to: ADMIN_VERIFICATION_EMAIL,
    subject,
    text,
    html:
      `<div style="font-family:Inter,system-ui,sans-serif;color:#111;max-width:520px">` +
      `<h2 style="margin-top:0">Emergize admin signup</h2>` +
      `<p>Someone is trying to create an admin account on the Emergize CRM.</p>` +
      `<p>Verification code:</p>` +
      `<div style="font-size:32px;font-weight:800;letter-spacing:4px;background:#9DCD3D;color:#0a0a0a;padding:14px 22px;border-radius:10px;display:inline-block;margin:6px 0 14px">${code}</div>` +
      (requestedForEmail ? `<p style="color:#555;font-size:13px">Requested for: <strong>${requestedForEmail}</strong></p>` : '') +
      `<p style="color:#555;font-size:13px">Expires in 15 minutes. If you didn't expect this, ignore the email — no admin account is created without the code.</p>` +
      `</div>`,
  })

  if (!sent.ok) {
    // We still return ok:true so the UI shows "code sent" — the code IS
    // in the DB. The email message is in stderr/Hostinger logs as a
    // fallback. Admin can grab it from there until Resend is wired up.
    return {
      ok: true,
      warning: `Code generated but email delivery is not configured. Admin can read the code from the server logs (look for [EMAIL_FALLBACK]) or ask devs to set RESEND_API_KEY env var. Detail: ${sent.error}`,
    }
  }

  return { ok: true }
}

export async function signupAsAdminAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const fullName = String(formData.get('full_name') || '').trim()
  const code = String(formData.get('verification_code') || '').trim()

  if (!email || !password) return { error: 'Email and password are required.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (!/^\d{6}$/.test(code)) return { error: 'Enter the 6-digit verification code from the admin email.' }

  const supa = agentSupabase()

  // 1. Validate code: must exist, not be used, not be expired
  const { data: codeRow, error: lookupErr } = await supa
    .from('admin_verification_codes')
    .select('id, code, expires_at, used_at, email')
    .eq('email', ADMIN_VERIFICATION_EMAIL)
    .eq('code', code)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lookupErr) return { error: `Lookup failed: ${lookupErr.message}` }
  if (!codeRow) return { error: 'Invalid verification code.' }
  if (codeRow.used_at) return { error: 'This code has already been used. Request a new one.' }
  if (new Date(codeRow.expires_at).getTime() < Date.now()) return { error: 'This code has expired. Request a new one.' }

  // 2. Create auth user with admin role in app_metadata
  const { data: created, error: createErr } = await supa.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { role: 'admin' },
  })
  if (createErr) {
    if (String(createErr.message).toLowerCase().includes('already')) {
      return { error: 'An account with that email already exists. Try signing in instead.' }
    }
    return { error: `Could not create account: ${createErr.message}` }
  }

  const userId = created?.user?.id
  if (!userId) return { error: 'Account creation returned no id. Try again.' }

  // 3. Create admin profile row
  await supa.from('profiles').upsert(
    { id: userId, email, full_name: fullName, role: 'admin' },
    { onConflict: 'id' },
  )

  // 4. Mark the code used
  await supa.from('admin_verification_codes').update({ used_at: new Date().toISOString() }).eq('id', codeRow.id)

  // 5. Sign the new admin in immediately
  const supabase = await createSupabaseServerClient()
  const { error: signinErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signinErr) {
    // Account created but auto-login failed — direct user to manual login
    revalidatePath('/', 'layout')
    redirect('/login?signup=admin_success')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
