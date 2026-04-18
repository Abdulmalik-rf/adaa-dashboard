import { redirect } from "next/navigation"
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server"
import { NotificationsDashboard } from "./NotificationsDashboard"

export const revalidate = 0

export default async function NotificationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const role = (user as any)?.profile?.role
  let q = supabase.from('notifications').select('*').order('created_at', { ascending: false })
  if (role !== 'admin') {
    q = q.or(`user_id.eq.${user.id},user_id.is.null`)
  }
  const { data: notifications } = await q

  return <NotificationsDashboard notifications={notifications || []} />
}
