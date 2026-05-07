import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Called from a Server Component; safe to ignore if proxy.ts refreshes sessions
        }
      },
    },
  })
}

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, avatar_url')
    .eq('id', user.id)
    .maybeSingle()
  return profile ? { ...user, profile } : { ...user, profile: null }
}

// Server-side admin gate. Drop this at the top of any admin-only page
// component to redirect non-admins to /my-dashboard (their natural
// landing surface). Sidebar nav items are hidden client-side too, but
// this guard catches direct URL navigation.
//
//   import { requireAdmin } from '@/lib/supabase/server'
//   export default async function Page() {
//     await requireAdmin()
//     ...
//   }
export async function requireAdmin() {
  const me = await getCurrentUser()
  if (!me) redirect('/login')
  if (me.profile?.role !== 'admin') redirect('/my-dashboard')
  return me
}
