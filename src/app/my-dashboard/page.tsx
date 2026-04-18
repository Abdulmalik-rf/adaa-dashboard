import { supabaseClient } from "@/lib/supabase/client"
import { MyDashboardClient } from "./MyDashboardClient"

export const revalidate = 0

const LOGGED_IN_USER_ID = 'tm2'

export default async function MyDashboardPage() {
  const [
    { data: teamMembers },
    { data: tasks },
    { data: contentItems },
    { data: clients },
    { data: clientServices },
    { data: contracts },
    { data: notifications },
  ] = await Promise.all([
    (supabaseClient as any).from('team_members').select('*'),
    (supabaseClient as any).from('tasks').select('*').order('due_date', { ascending: true }),
    (supabaseClient as any).from('content_items').select('*').order('publish_date', { ascending: true }),
    (supabaseClient as any).from('clients').select('*'),
    (supabaseClient as any).from('client_services').select('*'),
    (supabaseClient as any).from('contracts').select('*'),
    (supabaseClient as any).from('notifications').select('*').order('created_at', { ascending: false }).limit(30),
  ])

  const me = (teamMembers || []).find((m: any) => m.id === LOGGED_IN_USER_ID) || null

  const myTasks = (tasks || []).filter((t: any) => t.assignee_id === LOGGED_IN_USER_ID)
  const myContent = (contentItems || []).filter((c: any) => c.assignee_id === LOGGED_IN_USER_ID)
  const myNotifications = (notifications || []).filter(
    (n: any) => n.user_id === LOGGED_IN_USER_ID || n.user_id === null
  )

  const myClientIds = Array.from(
    new Set([
      ...myTasks.map((t: any) => t.client_id),
      ...myContent.map((c: any) => c.client_id),
    ].filter(Boolean))
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
