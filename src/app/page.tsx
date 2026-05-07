import { redirect } from "next/navigation"
import { supabaseClient } from "@/lib/supabase/client"
import { getCurrentUser } from "@/lib/supabase/server"
import { DashboardClient } from "./DashboardClient"

export const revalidate = 0

export default async function DashboardHome() {
  // Non-admins land on their personalized /my-dashboard. The executive
  // home shows agency-wide KPIs (revenue across all contracts, total
  // clients, pending tasks across the whole team) which aren't useful or
  // appropriate for staff role. /my-dashboard scopes to "your stuff".
  const me = await getCurrentUser()
  if (me && me.profile?.role !== 'admin') {
    redirect('/my-dashboard')
  }

  const [
    { data: clients },
    { data: contracts },
    { data: reminders },
    { data: tasks },
    { data: teamMembers },
    { data: contentItems },
    { data: notifications },
    { data: campaigns },
  ] = await Promise.all([
    (supabaseClient as any).from('clients').select('*'),
    (supabaseClient as any).from('contracts').select('*'),
    (supabaseClient as any).from('reminders').select('*'),
    (supabaseClient as any).from('tasks').select('*').order('created_at', { ascending: false }),
    (supabaseClient as any).from('team_members').select('*'),
    (supabaseClient as any).from('content_items').select('*').order('publish_date', { ascending: true }),
    (supabaseClient as any).from('notifications').select('*').order('created_at', { ascending: false }).limit(20),
    (supabaseClient as any).from('ad_campaigns').select('*'),
  ])

  return (
    <DashboardClient 
      clients={clients || []}
      contracts={contracts || []}
      reminders={reminders || []}
      tasks={tasks || []}
      teamMembers={teamMembers || []}
      contentItems={contentItems || []}
      notifications={notifications || []}
      campaigns={campaigns || []}
    />
  )
}
