import { supabaseClient } from "@/lib/supabase/client"
import { TaskBoardView } from "./TaskBoardView"
import { OpenClawPageBridge } from "@/components/layout/OpenClawPageBridge"

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

  const today = new Date().toISOString().split('T')[0]
  const overdueTasks = tasks?.filter((t: any) => t.status !== 'completed' && t.due_date && t.due_date < today).length || 0
  const pendingTasks = tasks?.filter((t: any) => t.status !== 'completed').length || 0

  return (
    <>
      <OpenClawPageBridge
        page="tasks"
        taskStats={{ overdue: overdueTasks, pending: pendingTasks, total: tasks?.length || 0 }}
      />
      
      <TaskBoardView 
        tasks={tasks || []} 
        teamMembers={teamMembers || []} 
        clients={clients || []} 
      />
    </>
  )
}
