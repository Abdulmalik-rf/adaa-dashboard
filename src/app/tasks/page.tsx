import { supabaseClient } from "@/lib/supabase/client"
import { TaskBoardView } from "./TaskBoardView"

export const revalidate = 0

export default async function TasksPage() {
  const [
    { data: tasks },
    { data: teamMembers },
    { data: clients },
  ] = await Promise.all([
    (supabaseClient as any).from('tasks').select('*').order('created_at', { ascending: false }),
    (supabaseClient as any).from('team_members').select('id, full_name'),
    (supabaseClient as any).from('clients').select('id, company_name'),
  ])

  return (
    <TaskBoardView
      tasks={tasks || []}
      teamMembers={teamMembers || []}
      clients={clients || []}
    />
  )
}
