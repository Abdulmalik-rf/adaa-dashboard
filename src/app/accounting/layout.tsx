import { requireAdmin } from '@/lib/supabase/server'

// Admin-only — invoices are financial records, sidebar already hides
// this link for non-admins; this layout catches direct URL access.
export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
