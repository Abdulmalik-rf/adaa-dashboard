import { redirect } from "next/navigation"
import { supabaseClient } from "@/lib/supabase/client"
import { getCurrentUser } from "@/lib/supabase/server"
import { MyDashboardClient } from "./MyDashboardClient"

export const revalidate = 0

export default async function MyDashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Resolve the team_members row for this auth user. Without it, we can't filter tasks/content.
  const { data: me } = await (supabaseClient as any)
    .from('team_members')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const myTeamMemberId = me?.id ?? null

  const [
    { data: tasks },
    { data: contentItems },
    { data: clients },
    { data: clientServices },
    { data: contracts },
    { data: notifications },
  ] = await Promise.all([
    (supabaseClient as any).from('tasks').select('*').order('due_date', { ascending: true }),
    (supabaseClient as any).from('content_items').select('*').order('publish_date', { ascending: true }),
    (supabaseClient as any).from('clients').select('*'),
    (supabaseClient as any).from('client_services').select('*'),
    (supabaseClient as any).from('contracts').select('*'),
    (supabaseClient as any).from('notifications').select('*').order('created_at', { ascending: false }).limit(30),
  ])

  const myTasks = myTeamMemberId
    ? (tasks || []).filter((t: any) => t.assignee_id === myTeamMemberId)
    : []
  const myContent = myTeamMemberId
    ? (contentItems || []).filter((c: any) => c.assignee_id === myTeamMemberId)
    : []
  const myNotifications = (notifications || []).filter(
    (n: any) => n.user_id === user.id || n.user_id === null
  )

  const myClientIds = Array.from(
    new Set(
      [
        ...myTasks.map((t: any) => t.client_id),
        ...myContent.map((c: any) => c.client_id),
      ].filter(Boolean)
    )
  )
  const myClients = (clients || []).filter((c: any) => myClientIds.includes(c.id))

  return (
    <MyDashboardClient
      me={me}
      tasks={myTasks}
      contentItems={myContent}
      clients={myClients}
      clientServices={clientServices || []}
      contracts={contracts || []}
      notifications={myNotifications}
    />
  )
}
