import { requireAdmin } from '@/lib/supabase/server'

// Admin-only section. Non-admins navigating directly to /leads get
// redirected to /my-dashboard. Sidebar nav already hides this link for
// non-admins; this layout catches direct URL access.
export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
