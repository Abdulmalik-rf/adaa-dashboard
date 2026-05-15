import { requireAdmin } from '@/lib/supabase/server'
import { AccountingSubNav } from './AccountingSubNav'

// Admin-only — invoices are financial records, sidebar already hides
// this link for non-admins; this layout catches direct URL access.
//
// Sub-nav pill strip exposes the 5 accounting sub-sections so admin can
// hop between them without going back to the sidebar.
export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return (
    <div className="space-y-4">
      <AccountingSubNav />
      {children}
    </div>
  )
}
