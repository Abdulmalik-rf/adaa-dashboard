import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/supabase/server'
import { LoginForm } from './LoginForm'

export const revalidate = 0

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ signup?: string }>
}) {
  const user = await getCurrentUser()
  if (user) {
    const role = (user as any).profile?.role || 'user'
    redirect(role === 'admin' ? '/' : '/my-dashboard')
  }

  const params = await searchParams
  return <LoginForm signupSuccess={params?.signup === 'success'} />
}
