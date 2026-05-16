"use server"

import { supabaseClient } from "@/lib/supabase/client"
import { agentSupabase } from "@/lib/chat-agent/supabase"
import { getCurrentUser } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// Generate a memorable-but-strong password the admin can read aloud /
// paste into a message. Pattern: AdjNoun## + symbol.
function generatePassword(): string {
  const adj = ['Bold', 'Swift', 'Bright', 'Crisp', 'Sharp', 'Vivid', 'Lucid', 'Brisk', 'Solid', 'Witty']
  const noun = ['Falcon', 'Cedar', 'River', 'Spark', 'Atlas', 'Quartz', 'Comet', 'Onyx', 'Lynx', 'Kestrel']
  const rand = (a: string[]) => a[Math.floor(Math.random() * a.length)]
  const num = Math.floor(Math.random() * 90 + 10)
  return rand(adj) + rand(noun) + num + '!'
}

type CreateTeamMemberResult =
  | { ok: true; credentials?: { email: string; password: string }; warning?: string }
  | { ok: false; error: string }

export async function createTeamMember(formData: FormData): Promise<CreateTeamMemberResult> {
  const full_name = formData.get('full_name') as string
  const role = (formData.get('role') as string) || 'employee'
  const job_title = formData.get('job_title') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const whatsapp = formData.get('whatsapp') as string
  const status = (formData.get('status') as string) || 'active'
  const salaryRaw = formData.get('salary') as string | null
  const salary = salaryRaw && salaryRaw.trim() ? parseFloat(salaryRaw) : null
  const salary_currency = (formData.get('salary_currency') as string) || 'SAR'
  const create_login = formData.get('create_login') === 'on' || formData.get('create_login') === 'true'

  // Admin-only gate when creating a login. Adding a team-member row without
  // a login is fine for any signed-in user, but creating an auth account
  // requires admin role.
  if (create_login) {
    const me = await getCurrentUser()
    if (!me || me.profile?.role !== 'admin') {
      return { ok: false, error: 'Only admins can create login accounts.' }
    }
  }

  // Insert the team_members row first
  const { data: inserted, error: insertErr } = await (supabaseClient as any)
    .from('team_members')
    .insert({
      full_name,
      role,
      job_title,
      email,
      phone,
      whatsapp,
      status,
      salary,
      salary_currency,
    })
    .select()
    .single()

  if (insertErr) return { ok: false, error: 'Failed to create member: ' + insertErr.message }

  // Optionally create the auth account + profile row + link team_members.user_id
  let credentials: { email: string; password: string } | undefined
  let warning: string | undefined
  if (create_login && email) {
    const supa = agentSupabase()
    const password = generatePassword()
    // Map team-member role values to profile roles. The team_members table
    // uses 'employee'; profiles convention is 'staff' for non-admins.
    const profileRole =
      role === 'admin' ? 'admin' : role === 'manager' ? 'manager' : 'staff'

    const { data: created, error: createErr } = await supa.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
      app_metadata: { role: profileRole },
    })

    let userId: string | undefined = created?.user?.id
    if (createErr) {
      if (String(createErr.message).toLowerCase().includes('already')) {
        // Email already in use — find existing user and reset their password
        const { data: list } = await supa.auth.admin.listUsers({ perPage: 1000 })
        const existing = list?.users?.find((u) => u.email === email)
        if (existing) {
          await supa.auth.admin.updateUserById(existing.id, {
            password,
            app_metadata: { role: profileRole },
          })
          userId = existing.id
          warning = 'Email was already registered — existing account password has been reset.'
        } else {
          warning = 'Could not create login: ' + createErr.message
        }
      } else {
        warning = 'Could not create login: ' + createErr.message
      }
    }

    if (userId) {
      // Upsert profile with the right role
      await supa.from('profiles').upsert(
        { id: userId, email, full_name, role: profileRole },
        { onConflict: 'id' },
      )
      // Link team_members.user_id to the auth user so future profile lookups
      // can join the two
      await (supabaseClient as any)
        .from('team_members')
        .update({ user_id: userId })
        .eq('id', inserted.id)
      credentials = { email, password }
    }
  }

  revalidatePath('/team')
  return { ok: true, credentials, warning }
}

export async function updateTeamMember(id: string, updates: any) {
  const { error } = await (supabaseClient as any)
    .from('team_members')
    .update(updates)
    .eq('id', id)

  if (error) throw new Error("Failed")
  revalidatePath('/team')
}

// Admin-only update of just the role. Used by the inline RoleSelect pill
// on /team. Keeps role mutations out of the broader updateTeamMember
// signature so accidental writes from other forms can't elevate someone.
export async function updateTeamMemberRole(
  input: { id: string; role: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
    const allowed = ['admin', 'hr', 'finance', 'manager', 'staff']
    if (!allowed.includes(input.role)) return { ok: false, error: `Invalid role: ${input.role}` }

    // Service-role client so RLS doesn't block.
    const supa = agentSupabase()
    const { error } = await (supa as any).from('team_members').update({ role: input.role }).eq('id', input.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/team')
    revalidatePath('/hr')
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

export async function deleteTeamMember(id: string): Promise<void> {
  try {
    // Admin gate — only admins can delete team members
    const me = await getCurrentUser()
    if (!me || me.profile?.role !== 'admin') {
      console.error('[deleteTeamMember] denied: not admin')
      return
    }

    // Service-role client so RLS / FK / auth-user cleanup all work reliably
    const supa = agentSupabase()

    // 1. Look up the member's linked auth user_id (if any) before deleting
    const { data: member } = await (supa as any)
      .from('team_members')
      .select('user_id, full_name')
      .eq('id', id)
      .maybeSingle()

    // 2. Delete the team_members row first
    const { error: delErr } = await (supa as any).from('team_members').delete().eq('id', id)
    if (delErr) {
      console.error('[deleteTeamMember] db error:', delErr.message)
      return
    }

    // 3. If member had a linked auth user, delete that auth user + profile
    //    so they can't sign back in. Best-effort — don't fail the whole op
    //    on cleanup errors since the team_members row is already gone.
    if (member?.user_id) {
      try { await supa.from('profiles').delete().eq('id', member.user_id) } catch {}
      try { await supa.auth.admin.deleteUser(member.user_id) } catch {}
    }
  } catch (err: any) {
    console.error('[deleteTeamMember] unexpected error:', err?.message ?? err)
    return
  }
  revalidatePath('/team')
}

// Reset / re-issue a login for an existing team member. Returns the new
// password so the admin can hand it off. Admin-only.
export async function resetTeamMemberPassword(memberId: string): Promise<CreateTeamMemberResult> {
  const me = await getCurrentUser()
  if (!me || me.profile?.role !== 'admin') {
    return { ok: false, error: 'Only admins can reset passwords.' }
  }

  const { data: member, error: fetchErr } = await (supabaseClient as any)
    .from('team_members').select('id, full_name, email, role, user_id').eq('id', memberId).single()
  if (fetchErr || !member) return { ok: false, error: 'Member not found.' }
  if (!member.email) return { ok: false, error: 'Member has no email — cannot reset login.' }

  const supa = agentSupabase()
  const password = generatePassword()

  const profileRole =
    member.role === 'admin' ? 'admin' : member.role === 'manager' ? 'manager' : 'staff'

  let userId: string | undefined = member.user_id
  if (!userId) {
    // No linked auth user yet — create one
    const { data: created, error: cErr } = await supa.auth.admin.createUser({
      email: member.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: member.full_name },
      app_metadata: { role: profileRole },
    })
    if (cErr) {
      // Maybe already exists — fall back to lookup
      const { data: list } = await supa.auth.admin.listUsers({ perPage: 1000 })
      const existing = list?.users?.find((u) => u.email === member.email)
      if (existing) {
        userId = existing.id
        await supa.auth.admin.updateUserById(existing.id, {
          password,
          app_metadata: { role: profileRole },
        })
      } else {
        return { ok: false, error: 'Failed to create login: ' + cErr.message }
      }
    } else {
      userId = created?.user?.id
    }
    if (userId) {
      await (supabaseClient as any).from('team_members').update({ user_id: userId }).eq('id', memberId)
    }
  } else {
    const { error: uErr } = await supa.auth.admin.updateUserById(userId, {
      password,
      app_metadata: { role: profileRole },
    })
    if (uErr) return { ok: false, error: 'Failed to reset: ' + uErr.message }
  }

  // Make sure profile row exists with the right role
  if (userId) {
    await supa.from('profiles').upsert(
      { id: userId, email: member.email, full_name: member.full_name, role: profileRole },
      { onConflict: 'id' },
    )
  }

  revalidatePath('/team')
  return { ok: true, credentials: { email: member.email, password } }
}
