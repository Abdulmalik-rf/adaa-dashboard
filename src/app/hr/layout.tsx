import { requireAdmin } from '@/lib/supabase/server'

export default async function HRLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
