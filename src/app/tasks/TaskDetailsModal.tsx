'use client'

import React, { useState, useTransition } from 'react'
import { X, Calendar, User, Building2, Flag, AlignLeft, CheckCircle2, AlertCircle, Edit3, Save, Trash2, Loader2, RotateCcw } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { updateTaskData, deleteTask } from '@/app/actions/tasks'

interface TaskDetailsModalProps {
  task: any
  onClose: () => void
  onUpdateStatus: (id: string, status: string) => void
  onDelete: (id: string) => void
  onUpdate: (updated: any) => void
  teamMembers: any[]
  clients: any[]
}

const statusLabels: Record<string, { en: string; ar: string; color: string }> = {
  todo:        { en: 'To Do',       ar: 'للعمل',       color: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300' },
  in_progress: { en: 'In Progress', ar: 'قيد التنفيذ',  color: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400' },
  review:      { en: 'Review',      ar: 'مراجعة',      color: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400' },
  completed:   { en: 'Completed',   ar: 'مكتمل',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400' }
}

const priorityConfig: Record<string, { label: string; labelAr: string; color: string; dot: string }> = {
  urgent: { label: 'Urgent', labelAr: 'عاجل',  color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400',     dot: 'bg-red-500' },
  high:   { label: 'High',   labelAr: 'عالي',  color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-500' },
  medium: { label: 'Medium', labelAr: 'متوسط', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400',   dot: 'bg-amber-500' },
  low:    { label: 'Low',    labelAr: 'منخفض', color: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400',    dot: 'bg-slate-400' },
}

export function TaskDetailsModal({ task, onClose, onUpdateStatus, onDelete, onUpdate, teamMembers, clients }: TaskDetailsModalProps) {
  const { dir } = useLanguage()
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [form, setForm] = useState({
    title: task.title || '',
    description: task.description || '',
    due_date: task.due_date || '',
    priority: task.priority || 'medium',
    status: task.status || 'todo',
    assignee_id: task.assignee_id || '',
    client_id: task.client_id || '',
  })

  if (!task) return null

  const findMember = (id: string) => teamMembers?.find((m: any) => m.id === id)?.full_name || 'Unassigned'
  const findClient = (id: string) => clients?.find((c: any) => c.id === id)?.company_name || 'No Client'
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = task.due_date && task.due_date < today && task.status !== 'completed'

  const handleSave = () => {
    setSaveError('')
    startTransition(async () => {
      try {
        await updateTaskData(task.id, form)
        onUpdate({ ...task, ...form })
        setSaveSuccess(true)
        setTimeout(() => { setSaveSuccess(false); setIsEditing(false) }, 1200)
      } catch {
        setSaveError(dir === 'rtl' ? 'فشل حفظ المهمة.' : 'Failed to save task.')
      }
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteTask(task.id)
        onDelete(task.id)
        onClose()
      } catch {
        setSaveError(dir === 'rtl' ? 'فشل حذف المهمة.' : 'Failed to delete task.')
      }
    })
  }

  const field = (label: string, children: React.ReactNode) => (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="bg-[hsl(var(--card))] w-full max-w-2xl rounded-3xl shadow-2xl border border-[hsl(var(--border))] overflow-hidden relative z-10 flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className={`flex items-start justify-between p-6 border-b border-[hsl(var(--border))] ${isOverdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
          <div className="flex-1 min-w-0 pr-4">
            {isEditing ? (
              <input
                className="form-input text-xl font-bold w-full"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={dir === 'rtl' ? 'عنوان المهمة' : 'Task title'}
              />
            ) : (
              <div>
                <h2 className="text-xl font-bold leading-tight">{task.title}</h2>
                {isOverdue && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full mt-2">
                    <AlertCircle className="h-3 w-3" /> {dir === 'rtl' ? 'متأخرة' : 'OVERDUE'}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isEditing && (
              <button onClick={() => setIsEditing(true)} className="h-9 w-9 rounded-xl border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))] transition-all">
                <Edit3 className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => setShowDeleteConfirm(true)} className="h-9 w-9 rounded-xl border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:border-red-300 transition-all">
              <Trash2 className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="h-9 w-9 rounded-xl border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Feedback Bar */}
        {(saveError || saveSuccess) && (
          <div className={`px-6 py-2.5 text-sm font-semibold ${saveError ? 'bg-red-50 text-red-700 dark:bg-red-900/20' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20'}`}>
            {saveError || (dir === 'rtl' ? '✅ تم الحفظ بنجاح' : '✅ Task saved successfully')}
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {field(dir === 'rtl' ? 'الحالة' : 'Status',
              isEditing ? (
                <select className="form-input text-sm" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{dir === 'rtl' ? v.ar : v.en}</option>)}
                </select>
              ) : (
                <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border ${statusLabels[task.status]?.color}`}>
                  {dir === 'rtl' ? statusLabels[task.status]?.ar : statusLabels[task.status]?.en}
                </span>
              )
            )}
            {field(dir === 'rtl' ? 'الأولوية' : 'Priority',
              isEditing ? (
                <select className="form-input text-sm" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{dir === 'rtl' ? v.labelAr : v.label}</option>)}
                </select>
              ) : (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${priorityConfig[task.priority]?.color}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${priorityConfig[task.priority]?.dot}`} />
                  {dir === 'rtl' ? priorityConfig[task.priority]?.labelAr : priorityConfig[task.priority]?.label}
                </span>
              )
            )}
            {field(dir === 'rtl' ? 'تاريخ الاستحقاق' : 'Due Date',
              isEditing ? (
                <input type="date" className="form-input text-sm" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              ) : (
                <span className={`text-sm font-semibold ${isOverdue ? 'text-red-500' : ''}`}>
                  {task.due_date || (dir === 'rtl' ? 'بدون تاريخ' : 'No Date')}
                </span>
              )
            )}
            {field(dir === 'rtl' ? 'المسؤول' : 'Assignee',
              isEditing ? (
                <select className="form-input text-sm" value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}>
                  <option value="">{dir === 'rtl' ? 'بدون مسؤول' : 'Unassigned'}</option>
                  {teamMembers.map((m: any) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] flex items-center justify-center text-[10px] font-bold">
                    {findMember(task.assignee_id).substring(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold truncate">{findMember(task.assignee_id)}</span>
                </div>
              )
            )}
          </div>

          {/* Client */}
          <div className="pt-4 border-t border-[hsl(var(--border)/0.5)]">
            {field(dir === 'rtl' ? 'العميل المرتبط' : 'Related Client',
              isEditing ? (
                <select className="form-input text-sm" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                  <option value="">{dir === 'rtl' ? 'بدون عميل' : 'No Client'}</option>
                  {clients.map((c: any) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[hsl(var(--muted)/0.5)] rounded-lg text-sm font-bold">
                  <Building2 className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                  {findClient(task.client_id)}
                </div>
              )
            )}
          </div>

          {/* Description */}
          <div className="pt-4 border-t border-[hsl(var(--border)/0.5)] space-y-2">
            <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider flex items-center gap-1.5">
              <AlignLeft className="h-3 w-3" /> {dir === 'rtl' ? 'الوصف / الملاحظات' : 'Description / Notes'}
            </label>
            {isEditing ? (
              <textarea
                className="form-input w-full min-h-[140px] resize-none text-sm leading-relaxed"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder={dir === 'rtl' ? 'اكتب تفاصيل المهمة...' : 'Add task details and notes...'}
              />
            ) : (
              <div className="bg-[hsl(var(--muted)/0.3)] p-4 rounded-xl min-h-[100px] border border-[hsl(var(--border)/0.5)]">
                {task.description ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>
                ) : (
                  <p className="text-sm text-[hsl(var(--muted-foreground))] italic">
                    {dir === 'rtl' ? 'لا يوجد وصف.' : 'No description provided.'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Status Quick Move (view mode) */}
          {!isEditing && (
            <div className="pt-4 border-t border-[hsl(var(--border)/0.5)]">
              <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
                {dir === 'rtl' ? 'نقل الحالة بسرعة' : 'Quick Status Move'}
              </p>
              <div className="flex flex-wrap gap-2">
                {['todo', 'in_progress', 'review', 'completed'].filter(s => s !== task.status).map(s => (
                  <button
                    key={s}
                    onClick={() => onUpdateStatus(task.id, s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:scale-105 ${statusLabels[s].color}`}
                  >
                    → {dir === 'rtl' ? statusLabels[s].ar : statusLabels[s].en}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.1)] flex items-center justify-between gap-3">
          {isEditing ? (
            <>
              <button onClick={() => { setIsEditing(false); setSaveError(''); setForm({ title: task.title, description: task.description, due_date: task.due_date, priority: task.priority, status: task.status, assignee_id: task.assignee_id, client_id: task.client_id }) }}
                className="btn btn-secondary flex items-center gap-1.5">
                <RotateCcw className="h-4 w-4" /> {dir === 'rtl' ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={handleSave} disabled={isPending || !form.title}
                className="btn btn-primary flex items-center gap-1.5 min-w-[120px] justify-center">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {dir === 'rtl' ? 'حفظ التغييرات' : 'Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsEditing(true)} className="btn btn-secondary flex items-center gap-1.5">
                <Edit3 className="h-4 w-4" /> {dir === 'rtl' ? 'تعديل المهمة' : 'Edit Task'}
              </button>
              {task.status !== 'completed' ? (
                <button onClick={() => onUpdateStatus(task.id, 'completed')}
                  className="btn bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-2 shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="h-4 w-4" /> {dir === 'rtl' ? 'إكمال المهمة' : 'Mark Complete'}
                </button>
              ) : (
                <button onClick={() => onUpdateStatus(task.id, 'todo')}
                  className="btn btn-secondary flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" /> {dir === 'rtl' ? 'إعادة فتح' : 'Reopen Task'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Delete Confirm Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative z-10 bg-[hsl(var(--card))] rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-red-200 dark:border-red-900/40">
            <div className="h-12 w-12 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mb-4">
              <Trash2 className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="font-bold text-lg mb-1">{dir === 'rtl' ? 'حذف المهمة؟' : 'Delete Task?'}</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5">
              {dir === 'rtl' ? `سيتم حذف "${task.title}" نهائياً ولا يمكن التراجع عن هذا الإجراء.` : `"${task.title}" will be permanently deleted. This cannot be undone.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn btn-secondary flex-1">{dir === 'rtl' ? 'إلغاء' : 'Cancel'}</button>
              <button onClick={handleDelete} disabled={isPending}
                className="btn bg-red-500 hover:bg-red-600 text-white flex-1 flex items-center justify-center gap-2">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {dir === 'rtl' ? 'حذف نهائي' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
