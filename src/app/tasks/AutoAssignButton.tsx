'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function AutoAssignButton({ unassignedTasks, team }: { unassignedTasks: any[], team: any[] }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  if (unassignedTasks.length === 0) return null

  const handleAutoAssign = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/openclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'distribute_tasks',
          payload: { team, tasks: unassignedTasks }
        })
      })
      if (!res.ok) throw new Error('API failed')
      
      const { data } = await res.json()
      
      // Update each task in db
      for (const assignment of data) {
         if (assignment.assigneeId) {
             await fetch('/api/tasks/assign', { 
                 method: 'POST', body: JSON.stringify(assignment) 
             })
         }
      }
      
      router.refresh()
    } catch (e) {
      alert("Failed to auto-assign via OpenClaw")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button 
      onClick={handleAutoAssign} 
      disabled={loading}
      className="btn bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20 border-0"
    >
      {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      OpenClaw Auto-Assign ({unassignedTasks.length})
    </button>
  )
}
