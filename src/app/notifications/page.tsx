import { supabaseClient } from "@/lib/supabase/client"
import { NotificationsDashboard } from "./NotificationsDashboard"

export const revalidate = 0

export default async function NotificationsPage() {
  const { data: notifications } = await (supabaseClient as any)
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })

  return <NotificationsDashboard notifications={notifications || []} />
}
