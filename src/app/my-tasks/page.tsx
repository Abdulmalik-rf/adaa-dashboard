import { redirect } from "next/navigation"
import { supabaseClient } from "@/lib/supabase/client"
import { getCurrentUser } from "@/lib/supabase/server"
import { markTaskCompleted } from "@/app/actions/tasks"
import { CheckCircle2, Clock, Circle, ArrowRight } from "lucide-react"

export const revalidate = 0

export default async function MyTasksPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { data: me } = await (supabaseClient as any)
    .from('team_members').select('id').eq('user_id', user.id).maybeSingle()
  const myTeamMemberId = me?.id ?? '__none__'

  const [
    { data: tasks },
    { data: contentItems },
    { data: clients },
  ] = await Promise.all([
    (supabaseClient as any).from('tasks').select('*').eq('assignee_id', myTeamMemberId),
    (supabaseClient as any).from('content_items').select('*').eq('assignee_id', myTeamMemberId),
    (supabaseClient as any).from('clients').select('id, company_name'),
  ])

  const allMyTasks = [
    ...(tasks || []).map((t: any) => ({ ...t, _type: 'task' as const })),
    ...(contentItems || []).map((c: any) => ({
      ...c, _type: 'content' as const,
      status: c.task_status,
      description: `${c.platform} • ${c.content_type} • Due: ${c.publish_date}`,
    }))
  ]

  const pending = allMyTasks.filter(t => t.status !== 'completed')
  const completed = allMyTasks.filter(t => t.status === 'completed')

  const findClient = (id: string) => clients?.find((c: any) => c.id === id)?.company_name || '—'

  const priorityColor: Record<string, string> = {
    urgent: 'border-l-red-500 bg-red-50/30 dark:bg-red-900/5',
    high: 'border-l-orange-500 bg-orange-50/30 dark:bg-orange-900/5',
    medium: 'border-l-amber-500',
    low: 'border-l-gray-300',
  }

  const platformIcon: Record<string, string> = {
    instagram: '📸', tiktok: '🎬', snapchat: '👻', google_ads: '🎯', default: '📋'
  }

  return (
    <div className="space-y-6 pb-8 max-w-5xl mx-auto">
      <div className="section-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            Hello Noura! You have <span className="font-semibold text-[hsl(var(--foreground))]">{pending.length}</span> pending task{pending.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="stat-card !p-3 text-center">
            <div className="text-xl font-bold">{pending.length}</div>
            <div className="text-[10px] text-[hsl(var(--muted-foreground))]">Pending</div>
          </div>
          <div className="stat-card !p-3 text-center">
            <div className="text-xl font-bold text-emerald-600">{completed.length}</div>
            <div className="text-[10px] text-[hsl(var(--muted-foreground))]">Done</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Pending */}
        <div className="space-y-3">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" /> Pending Work
          </h2>
          {pending.length === 0 && (
            <div className="premium-card p-8 text-center">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500 opacity-60" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">All tasks completed! Great job! 🎉</p>
            </div>
          )}
          {pending.map((task: any) => (
            <div key={task.id} className={`premium-card p-4 border-l-4 ${priorityColor[task.priority] || 'border-l-gray-300'} space-y-3`}>
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 mt-0.5">
                  <span className="text-base">{task._type === 'content' ? (platformIcon[task.platform] || platformIcon.default) : '📋'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm">{task.title}</h3>
                    <span className="badge badge-secondary text-[10px] uppercase flex-shrink-0">{task._type}</span>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{task.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                    <span>{findClient(task.client_id)}</span>
                    {(task.due_date || task.publish_date) && (
                      <span>Due: {task.due_date || task.publish_date}</span>
                    )}
                    {task.priority && (
                      <span className={`badge text-[10px] ${task.priority === 'urgent' ? 'badge-danger' : task.priority === 'high' ? 'badge-warning' : 'badge-secondary'}`}>
                        {task.priority}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <form action={markTaskCompleted.bind(null, task.id, task._type, 'completed')}>
                <button type="submit" className="btn btn-xs btn-primary w-full">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark as Completed
                </button>
              </form>
            </div>
          ))}
        </div>

        {/* Completed */}
        <div className="space-y-3">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Completed
          </h2>
          {completed.length === 0 && (
            <div className="premium-card p-8 text-center">
              <Circle className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No completed tasks yet</p>
            </div>
          )}
          {completed.map((task: any) => (
            <div key={task.id} className="premium-card p-4 opacity-60 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <h3 className="text-sm font-medium line-through">{task.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                   <form action={markTaskCompleted.bind(null, task.id, task._type, 'todo')}>
                     <button type="submit" className="btn btn-ghost btn-xs text-[hsl(var(--primary))] hover:bg-transparent">
                        Reopen
                     </button>
                   </form>
                   <span className="badge badge-success text-[10px]">Done</span>
                </div>
              </div>
              {task.completed_at && (
                <p className="text-xs text-[hsl(var(--muted-foreground))] pl-6 mt-1">
                  Completed: {new Date(task.completed_at).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
