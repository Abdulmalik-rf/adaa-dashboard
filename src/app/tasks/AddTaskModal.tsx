'use client'

import { useState } from 'react'
import { Plus, X, ListTodo, Calendar, User, Building, AlertCircle } from 'lucide-react'
import { createTask } from '@/app/actions/tasks'
import { useLanguage } from '@/lib/i18n/LanguageContext'

type Trigger = 'default' | 'compact'

export function AddTaskModal({
  teamMembers,
  clients,
  defaultStatus = 'todo',
  trigger = 'default',
}: {
  teamMembers: any[]
  clients: any[]
  defaultStatus?: string
  trigger?: Trigger
}) {
  const { dir } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) {
    if (trigger === 'compact') {
      // Used by per-column "Quick Add" buttons on the kanban board.
      // Pre-selects the column's status so the new task lands there.
      return (
        <button
          onClick={() => setIsOpen(true)}
          className="group mt-2 w-full border border-dashed border-[hsl(var(--border))] py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-[hsl(var(--primary)/0.05)] hover:border-[hsl(var(--primary)/0.3)] transition-all"
        >
          <Plus className="h-4 w-4 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))]" />
          <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] uppercase tracking-widest">
            {dir === 'rtl' ? 'إضافة سريعة' : 'Quick Add'}
          </span>
        </button>
      )
    }
    return (
      <button onClick={() => setIsOpen(true)} className="btn btn-primary">
        <Plus className="h-4 w-4" /> {dir === 'rtl' ? 'إضافة مهمة' : 'Add Task'}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      
      <div className="bg-[hsl(var(--card))] w-full max-w-lg rounded-3xl shadow-2xl border border-[hsl(var(--border))] overflow-hidden relative z-10 animate-modal-enter">
        <div className="flex items-center justify-between p-6 border-b border-[hsl(var(--border))]">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-[hsl(var(--primary))]" /> 
            {dir === 'rtl' ? 'إنشاء مهمة جديدة' : 'Create New Task'}
          </h2>
          <button onClick={() => setIsOpen(false)} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={async (formData) => {
          await createTask(formData)
          setIsOpen(false)
        }} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="form-label">{dir === 'rtl' ? 'عنوان المهمة' : 'Task Title'}</label>
            <input name="title" required className="form-input" placeholder={dir === 'rtl' ? 'مثال: تجهيز فيديو انستقرام' : 'e.g. Prepare Instagram Reel'} />
          </div>

          <div className="space-y-1.5">
            <label className="form-label">{dir === 'rtl' ? 'الوصف' : 'Description'}</label>
            <textarea name="description" className="form-input min-h-[100px]" placeholder={dir === 'rtl' ? 'تفاصيل المهمة...' : 'Detailed instructions...'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1.5">
                <label className="form-label flex items-center gap-2">
                   <Building className="h-3 w-3" /> {dir === 'rtl' ? 'العميل' : 'Client'}
                </label>
                <select name="client_id" className="form-input text-sm">
                   <option value="">{dir === 'rtl' ? 'اختر العميل' : 'Select Client'}</option>
                   {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
             </div>
             <div className="space-y-1.5">
                <label className="form-label flex items-center gap-2">
                   <User className="h-3 w-3" /> {dir === 'rtl' ? 'المسؤول' : 'Assignee'}
                </label>
                <select name="assignee_id" className="form-input text-sm">
                   <option value="">{dir === 'rtl' ? 'غير مسند' : 'Unassigned'}</option>
                   {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1.5">
                <label className="form-label flex items-center gap-2">
                   <Calendar className="h-3 w-3" /> {dir === 'rtl' ? 'تاريخ الاستحقاق' : 'Due Date'}
                </label>
                <input name="due_date" type="date" className="form-input text-sm" />
             </div>
             <div className="space-y-1.5">
                <label className="form-label flex items-center gap-2">
                   <AlertCircle className="h-3 w-3" /> {dir === 'rtl' ? 'الأولوية' : 'Priority'}
                </label>
                <select name="priority" className="form-input text-sm">
                   <option value="low">{dir === 'rtl' ? 'منخفضة' : 'Low'}</option>
                   <option value="medium">{dir === 'rtl' ? 'متوسطة' : 'Medium'}</option>
                   <option value="high">{dir === 'rtl' ? 'عالية' : 'High'}</option>
                   <option value="urgent">{dir === 'rtl' ? 'عاجلة' : 'Urgent'}</option>
                </select>
             </div>
          </div>

          <input type="hidden" name="status" value={defaultStatus} />

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={() => setIsOpen(false)} className="btn btn-secondary flex-1">
               {dir === 'rtl' ? 'إلغاء' : 'Cancel'}
            </button>
            <button type="submit" className="btn btn-primary flex-1">
               {dir === 'rtl' ? 'إنشاء المهمة' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
