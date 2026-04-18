'use client'

import { AlertCircle, CheckCircle2, Clock } from 'lucide-react'

export function TeamWorkload({ members, tasks }: { members: any[], tasks: any[] }) {
  // Calculate stats
  const memberStats = members.map(m => {
    const mTasks = tasks.filter(t => t.assignee_id === m.id)
    const completed = mTasks.filter(t => t.status === 'completed').length
    const pending = mTasks.filter(t => t.status !== 'completed').length
    const urgent = mTasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length
    
    // score relative to a max workload of 10 for visual percentage
    const workloadScore = Math.min((pending / 10) * 100, 100) 
    
    return { ...m, completed, pending, urgent, workloadScore }
  }).sort((a, b) => b.pending - a.pending)

  return (
    <div className="premium-card p-6 border-t-4 border-indigo-500 shadow-md">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-bold text-lg text-[hsl(var(--foreground))]">Team Workload Intelligence</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Real-time capacity tracking & performance.</p>
        </div>
      </div>

      <div className="space-y-4">
        {memberStats.map(m => (
          <div key={m.id} className="p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] hover:bg-[hsl(var(--muted)/0.5)] transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white shadow-sm ring-2 ring-indigo-500/20">
                  {m.full_name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-sm leading-tight">{m.full_name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{m.role || 'Executive'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> {m.completed} Done</div>
                <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-amber-500" /> {m.pending} Pending</div>
                {m.urgent > 0 && <div className="flex items-center gap-1 text-red-500"><AlertCircle className="h-3 w-3" /> {m.urgent} Urgent</div>}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[hsl(var(--muted))] rounded-full h-2 overflow-hidden flex">
               <div 
                 className={`h-full transition-all duration-1000 ${m.workloadScore > 80 ? 'bg-red-500' : m.workloadScore > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                 style={{ width: `${m.workloadScore}%` }} 
               />
            </div>
            {m.workloadScore > 80 && <p className="text-[10px] text-red-500 font-bold mt-1 tracking-wider uppercase">Over capacity warning</p>}
          </div>
        ))}
        {memberStats.length === 0 && <p className="text-xs text-[hsl(var(--muted-foreground))] text-center py-4">No team activity found.</p>}
      </div>
    </div>
  )
}
