'use client'

import React, { useState, useMemo, useTransition, useEffect } from 'react'
import { 
  Search, Filter, Plus, Clock, CheckCircle2, AlertCircle, 
  MoreHorizontal, Edit3, Trash2, ArrowRight, ArrowLeft,
  ChevronRight, ListTodo, User, Building2, Calendar,
  LayoutDashboard, LayoutList, GripVertical, ArrowUpDown
} from 'lucide-react'
import { updateTaskStatus, deleteTask } from '@/app/actions/tasks'
import { AddTaskModal } from './AddTaskModal'
import { TaskDetailsModal } from './TaskDetailsModal'
import { useLanguage } from '@/lib/i18n/LanguageContext'

type Status = 'todo' | 'in_progress' | 'review' | 'completed'
type Priority = 'urgent' | 'high' | 'medium' | 'low'

interface TaskBoardViewProps {
  tasks: any[]
  teamMembers: any[]
  clients: any[]
}

export function TaskBoardView({ tasks: initialTasks, teamMembers, clients }: TaskBoardViewProps) {
  const { t, dir } = useLanguage()
  const [searchTerm, setSearchTerm] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [sortFilter, setSortFilter] = useState<string>('newest')
  
  const [selectedTask, setSelectedTask] = useState<any>(null)
  
  // Optimistic UI for drag & drop
  const [isPending, startTransition] = useTransition()
  const [optimisticTasks, setOptimisticTasks] = useState(initialTasks)

  // Keep optimistic in sync if initialTasks prop changes from server
  useEffect(() => {
    setOptimisticTasks(initialTasks)
  }, [initialTasks])

  const findMember = (id: string) => teamMembers?.find((m: any) => m.id === id)?.full_name || 'Unassigned'
  const findClient = (id: string) => clients?.find((c: any) => c.id === id)?.company_name || 'No Client'

  const today = new Date().toISOString().split('T')[0]
  
  const stats = useMemo(() => {
    return {
      total: optimisticTasks.length,
      overdue: optimisticTasks.filter(t => t.status !== 'completed' && t.due_date && t.due_date < today).length,
      completedToday: optimisticTasks.filter(t => t.status === 'completed' && t.updated_at?.startsWith(today)).length,
      inProgress: optimisticTasks.filter(t => t.status === 'in_progress').length
    }
  }, [optimisticTasks, today])

  const filteredTasks = useMemo(() => {
    let filtered = optimisticTasks.filter(task => {
      const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            task.description?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter
      const matchesClient = clientFilter === 'all' || task.client_id === clientFilter
      const matchesAssignee = assigneeFilter === 'all' || task.assignee_id === assigneeFilter
      return matchesSearch && matchesPriority && matchesClient && matchesAssignee
    })

    if (sortFilter === 'newest') filtered.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    if (sortFilter === 'oldest') filtered.sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    if (sortFilter === 'due_date') filtered.sort((a,b) => {
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })
    if (sortFilter === 'priority') {
       const pmap: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }
       filtered.sort((a,b) => (pmap[b.priority] || 0) - (pmap[a.priority] || 0))
    }
    
    return filtered
  }, [optimisticTasks, searchTerm, priorityFilter, clientFilter, assigneeFilter, sortFilter])

  const statusLabels: Record<Status, { en: string; ar: string; color: string }> = {
    todo:        { en: 'To Do',       ar: 'للعمل',    color: 'bg-slate-400' },
    in_progress: { en: 'In Progress', ar: 'قيد التنفيذ', color: 'bg-amber-500' },
    review:      { en: 'Review',      ar: 'المراجعة',  color: 'bg-indigo-500' },
    completed:   { en: 'Completed',   ar: 'مكتمل',    color: 'bg-emerald-500' }
  }

  const priorityConfig: Record<Priority, { label: string, labelAr: string, color: string, glow: string }> = {
    urgent: { label: 'Urgent', labelAr: 'عاجل',  color: 'bg-red-500/10 text-red-600 border-red-500/20', glow: 'shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)] border-red-500/30 ring-1 ring-red-500/20' },
    high:   { label: 'High',   labelAr: 'عالي',  color: 'bg-orange-500/10 text-orange-600 border-orange-500/20', glow: '' },
    medium: { label: 'Medium', labelAr: 'متوسط', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', glow: '' },
    low:    { label: 'Low',    labelAr: 'منخفض', color: 'bg-slate-500/10 text-slate-600 border-slate-500/20', glow: '' },
  }

  // --- Drag and Drop Logic --- //
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId)
    // Small timeout to allow the browser to capture the drag image before hiding the old one if needed
    // e.currentTarget.classList.add('opacity-50')
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault() // Necessary to allow dropping
  }

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return

    const task = optimisticTasks.find(t => t.id === taskId)
    if (task && task.status !== newStatus) {
      handleModalStatusUpdate(taskId, newStatus)
    }
  }

  // --- Action Logic --- //
  const handleModalStatusUpdate = (taskId: string, newStatus: string) => {
    setOptimisticTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask((prev: any) => ({ ...prev, status: newStatus }))
    }
    startTransition(() => {
      updateTaskStatus(taskId, newStatus)
    })
  }

  const handleDeleteTask = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    handleDeleteById(taskId)
  }

  const handleDeleteById = (taskId: string) => {
    setOptimisticTasks(prev => prev.filter(t => t.id !== taskId))
    if (selectedTask?.id === taskId) setSelectedTask(null)
    startTransition(() => { deleteTask(taskId) })
  }

  const handleTaskUpdate = (updated: any) => {
    setOptimisticTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
    setSelectedTask(updated)
  }

  const handleArrowAdvance = (e: React.MouseEvent, taskId: string, currentStatus: string) => {
    e.stopPropagation()
    const newStatus = currentStatus === 'todo' ? 'in_progress' : currentStatus === 'in_progress' ? 'review' : 'completed'
    handleModalStatusUpdate(taskId, newStatus)
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Header & Quick Stats */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-[hsl(var(--primary))] flex items-center justify-center text-white shadow-lg shadow-[hsl(var(--primary)/0.2)]">
              <ListTodo className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {dir === 'rtl' ? 'لوحة المهام والعمليات' : 'Operations & Tasks'}
            </h1>
          </div>
          <p className="text-[hsl(var(--muted-foreground))] max-w-2xl">
            {dir === 'rtl' ? 'إدارة سير العمليات، تتبع تقدم الفريق، وضمان تسليم المشاريع في مواعيدها المحددة. (ادعم ميزة السحب والإفلات)' : 'Manage workflows, track team progress, and ensure project delivery stays on schedule. (Supports Drag-and-Drop)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
           <div className="flex bg-[hsl(var(--muted)/0.5)] p-4 rounded-2xl border border-[hsl(var(--border))] gap-6 shadow-sm">
              <div className="text-center px-4 border-r border-[hsl(var(--border)/0.5)] last:border-0">
                 <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Total</p>
                 <p className="text-xl font-bold">{stats.total}</p>
              </div>
              <div className="text-center px-4 border-r border-[hsl(var(--border)/0.5)] last:border-0">
                 <p className="text-[10px] font-bold text-red-500 uppercase">Overdue</p>
                 <p className="text-xl font-bold text-red-500">{stats.overdue}</p>
              </div>
              <div className="text-center px-4 border-r border-[hsl(var(--border)/0.5)] last:border-0">
                 <p className="text-[10px] font-bold text-emerald-500 uppercase">Today</p>
                 <p className="text-xl font-bold text-emerald-500">{stats.completedToday}</p>
              </div>
           </div>
           <AddTaskModal teamMembers={teamMembers} clients={clients} />
        </div>
      </div>

      {/* Control Bar (Filters & Search) */}
      <div className="premium-card p-4 flex flex-col md:flex-row gap-4 items-center bg-[hsl(var(--card)/0.5)] backdrop-blur-sm border-[hsl(var(--border))] shadow-sm">
        <div className="relative flex-1 w-full">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
           <input 
             type="text" 
             placeholder={dir === 'rtl' ? 'بحث عن مهمة...' : 'Search tasks...'}
             className="form-input !pl-10 !py-2.5 text-sm"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
           <div className="flex items-center gap-2 border-r border-[hsl(var(--border)/0.5)] pr-3 mr-1">
             <ArrowUpDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
             <select 
               className="form-input !py-2 text-xs !w-auto bg-transparent border-none font-bold outline-none ring-0 shadow-none focus:ring-0 cursor-pointer"
               value={sortFilter}
               onChange={(e) => setSortFilter(e.target.value)}
             >
                <option value="newest">{dir === 'rtl' ? 'الأحدث أولاً' : 'Newest First'}</option>
                <option value="oldest">{dir === 'rtl' ? 'الأقدم أولاً' : 'Oldest First'}</option>
                <option value="due_date">{dir === 'rtl' ? 'الاستحقاق' : 'Due Date'}</option>
                <option value="priority">{dir === 'rtl' ? 'الأولوية' : 'Priority'}</option>
             </select>
           </div>

           <select 
             className="form-input !py-2 text-xs !w-auto"
             value={priorityFilter}
             onChange={(e) => setPriorityFilter(e.target.value)}
           >
              <option value="all">{dir === 'rtl' ? 'كل الأولويات' : 'All Priorities'}</option>
              <option value="urgent">🔴 Urgent</option>
              <option value="high">🟠 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">🔵 Low</option>
           </select>

           <select 
             className="form-input !py-2 text-xs !w-auto"
             value={clientFilter}
             onChange={(e) => setClientFilter(e.target.value)}
           >
              <option value="all">{dir === 'rtl' ? 'كل العملاء' : 'All Clients'}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
           </select>

           <select 
             className="form-input !py-2 text-xs !w-auto"
             value={assigneeFilter}
             onChange={(e) => setAssigneeFilter(e.target.value)}
           >
              <option value="all">{dir === 'rtl' ? 'كل الفريق' : 'All Team'}</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
           </select>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide min-h-[600px] select-none">
        {(['todo', 'in_progress', 'review', 'completed'] as Status[]).map((status) => {
          const columnTasks = filteredTasks.filter(t => t.status === status)
          const label = dir === 'rtl' ? statusLabels[status].ar : statusLabels[status].en
          
          return (
            <div 
              key={status} 
              className={`flex-1 min-w-[320px] max-w-[400px] flex flex-col gap-4 p-3 rounded-3xl transition-colors border border-transparent hover:border-[hsl(var(--border)/0.5)] ${isPending ? 'opacity-90' : ''}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, status)}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-2">
                 <div className="flex items-center gap-2.5">
                    <div className={`h-3 w-3 rounded-full ${statusLabels[status].color} shadow-sm`} />
                    <h3 className="font-bold text-sm tracking-tight">{label}</h3>
                    <span className="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] px-1.5 py-0.5 rounded-md text-[10px] font-bold">
                       {columnTasks.length}
                    </span>
                 </div>
                 <button className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-colors">
                    <MoreHorizontal className="h-4 w-4" />
                 </button>
              </div>

              {/* Column Tasks Container */}
              <div className="flex-1 flex flex-col gap-4">
                 {columnTasks.map((task) => {
                   const isOverdue = task.due_date && task.due_date < today && task.status !== 'completed'
                   return (
                     <div 
                       key={task.id} 
                       draggable
                       onDragStart={(e) => handleDragStart(e, task.id)}
                       onClick={() => setSelectedTask(task)}
                       className={`premium-card p-5 space-y-4 group cursor-grab active:cursor-grabbing hover:shadow-xl border-transparent hover:border-[hsl(var(--primary)/0.3)] hover:-translate-y-1 transition-all duration-200 ${priorityConfig[task.priority as Priority]?.glow || ''}`}
                     >
                        <div className="flex items-start justify-between gap-3">
                           <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-sm leading-snug group-hover:text-[hsl(var(--primary))] transition-colors">{task.title}</h4>
                              <div className="flex items-center gap-1.5 mt-2">
                                 <Building2 className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                                 <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] tracking-wide truncate max-w-[120px] uppercase">
                                    {findClient(task.client_id)}
                                 </span>
                              </div>
                           </div>
                           <span className={`badge text-[9px] px-2 py-0.5 border ${priorityConfig[task.priority as Priority]?.color}`}>
                              {dir === 'rtl' ? priorityConfig[task.priority as Priority]?.labelAr : priorityConfig[task.priority as Priority]?.label}
                           </span>
                        </div>

                        {task.description && (
                          <p className="text-xs text-[hsl(var(--muted-foreground)/0.8)] line-clamp-2 leading-relaxed">
                            {task.description}
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-4 border-t border-[hsl(var(--border)/0.5)]">
                           <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-[hsl(var(--card))] shadow-sm">
                                 {findMember(task.assignee_id).substring(0, 2).toUpperCase()}
                              </div>
                              <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">{findMember(task.assignee_id)}</span>
                           </div>
                           
                           <div className="flex items-center gap-4">
                              {task.due_date && (
                                <div className={`flex items-center gap-1.5 text-[10px] font-bold ${isOverdue ? 'text-red-500 animate-pulse' : 'text-[hsl(var(--muted-foreground))]'}`}>
                                   {isOverdue && <AlertCircle className="h-3.5 w-3.5" />}
                                   {!isOverdue && <Calendar className="h-3.5 w-3.5" />}
                                   {task.due_date}
                                </div>
                              )}
                           </div>
                        </div>

                        {/* Action Bar (Hover only) */}
                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-200">
                           {status !== 'completed' && (
                             <button
                               onClick={(e) => handleArrowAdvance(e, task.id, status)}
                               className="h-8 w-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:scale-110 active:scale-95 transition-all"
                             >
                               <ChevronRight className={`h-4 w-4 ${dir === 'rtl' ? 'rotate-180' : ''}`} />
                             </button>
                           )}
                           <button 
                             onClick={(e) => { e.stopPropagation(); setSelectedTask(task) }}
                             className="h-8 w-8 rounded-lg bg-white dark:bg-slate-800 border border-[hsl(var(--border))] flex items-center justify-center hover:bg-[hsl(var(--muted))] transition-colors shadow-sm"
                           >
                              <Edit3 className="h-3.5 w-3.5" />
                           </button>
                           <button 
                             onClick={(e) => handleDeleteTask(e, task.id)}
                             className="h-8 w-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"
                           >
                              <Trash2 className="h-3.5 w-3.5" />
                           </button>
                        </div>
                     </div>
                   )
                 })}

                 {columnTasks.length === 0 && (
                   <div className="p-12 border-2 border-dashed border-[hsl(var(--border))] rounded-3xl flex flex-col items-center justify-center gap-3 text-center opacity-40">
                      <div className="h-12 w-12 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center">
                         <LayoutList className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest">{dir === 'rtl' ? 'فارغ' : 'Queue Empty'}</p>
                        <p className="text-[10px] mt-1">{dir === 'rtl' ? 'اسحب المهام وأفلتها هنا' : 'Drag and drop tasks here'}</p>
                      </div>
                   </div>
                 )}
              </div>

              {/* Add Quick Task in Column */}
              <button className="group mt-2 border border-dashed border-[hsl(var(--border))] py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-[hsl(var(--primary)/0.05)] hover:border-[hsl(var(--primary)/0.3)] transition-all">
                 <Plus className="h-4 w-4 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))]" />
                 <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] uppercase tracking-widest">
                    {dir === 'rtl' ? 'إضافة سريعة' : 'Quick Add'}
                 </span>
              </button>
            </div>
          )
        })}
      </div>

      {selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdateStatus={handleModalStatusUpdate}
          onDelete={handleDeleteById}
          onUpdate={handleTaskUpdate}
          teamMembers={teamMembers}
          clients={clients}
        />
      )}
    </div>
  )
}
