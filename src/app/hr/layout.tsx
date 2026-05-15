import { requireAdmin } from '@/lib/supabase/server'
import { HrSubNav } from './HrSubNav'

export default async function HRLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return (
    <div className="space-y-4">
      <HrSubNav />
      {children}
    </div>
  )
}
