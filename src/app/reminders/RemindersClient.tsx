'use client'

import { useState } from 'react'
import { Plus, Bell, Trash2, CheckCircle2, Clock, AlertCircle, Building2 } from 'lucide-react'
import { createReminder, updateReminderStatus, deleteReminder } from '@/app/actions/reminders'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface Reminder {
  id: string
  client_id: string
  title: string
  type: string
  priority: string
  due_date: string
  status: string
  notes?: string
}

const priorityConfig: Record<string, { cls: string; icon: any }> = {
  high: { cls: 'badge-danger', icon: AlertCircle },
  medium: { cls: 'badge-warning', icon: Clock },
  low: { cls: 'badge-secondary', icon: Bell },
}

export function RemindersClient({ reminders, clients }: { reminders: Reminder[]; clients: { id: string; company_name: string }[] }) {
  const { language, dir } = useLanguage()
  const ar = language === 'ar'

  // Labels that depend on stored DB enum values — keep keys in English so
  // the DB row stays identical, only flip display strings.
  const priorityLabel = (p: string) => ar ? ({ low: 'منخفضة', medium: 'متوسطة', high: 'عالية' } as any)[p] || p : p
  const typeLabel = (typ: string) => ar ? ({
    call: 'مكالمة', email: 'بريد إلكتروني', meeting: 'موعد / اجتماع',
    contract: 'عقد', report: 'تقرير', payment: 'دفع', other: 'أخرى',
  } as any)[typ] || typ : typ
  const filterLabel = (f: string) => ar
    ? ({ pending: 'بانتظار التنفيذ', completed: 'مكتملة', all: 'الكل' } as any)[f] || f
    : f.charAt(0).toUpperCase() + f.slice(1)

  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<string>('pending')

  const pendingCount = reminders.filter(r => r.status === 'pending').length
  const highCount = reminders.filter(r => r.priority === 'high' && r.status === 'pending').length
  const completedCount = reminders.filter(r => r.status === 'completed').length

  const filtered = filter === 'all' ? reminders : reminders.filter(r => r.status === filter)

  const findClient = (id: string) => clients.find(c => c.id === id)?.company_name || '—'

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    await createReminder(fd)
    setSaving(false)
    setShowModal(false)
    window.location.reload()
  }

  const handleComplete = async (id: string) => {
    await updateReminderStatus(id, 'completed')
    window.location.reload()
  }

  const handleDelete = async (id: string) => {
    if (!confirm(ar ? 'حذف هذا التذكير؟' : 'Delete this reminder?')) return
    await deleteReminder(id)
    window.location.reload()
  }

  const isOverdue = (date: string) => new Date(date) < new Date()

  return (
    <div className="space-y-6 pb-8" dir={dir}>
      <div className="section-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? 'التذكيرات' : 'Reminders'}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            {ar ? 'تتبع المتابعات والمواعيد النهائية والإجراءات المهمة' : 'Track follow-ups, deadlines, and important actions'}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary">
          <Plus className="h-4 w-4" /> {ar ? 'تذكير جديد' : 'New Reminder'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="text-2xl font-bold">{pendingCount}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{ar ? 'بانتظار التنفيذ' : 'Pending'}</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-bold text-red-600">{highCount}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{ar ? 'أولوية عالية' : 'High Priority'}</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-bold text-emerald-600">{completedCount}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{ar ? 'مكتملة' : 'Completed'}</div>
        </div>
      </div>

      {/* Filter */}
      <div className="tab-list w-fit">
        {['pending', 'completed', 'all'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`tab-item ${filter === s ? 'tab-item-active' : ''}`}>
            {filterLabel(s)}
          </button>
        ))}
      </div>

      {/* Reminder Cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="premium-card p-16 text-center">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-[hsl(var(--muted-foreground))]">{ar ? 'لا توجد تذكيرات في هذا التصنيف' : 'No reminders in this category'}</p>
            <button onClick={() => setShowModal(true)} className="btn btn-primary mt-4">
              <Plus className="h-4 w-4" /> {ar ? 'إضافة تذكير' : 'Add Reminder'}
            </button>
          </div>
        )}
        {filtered.map(reminder => {
          const pcfg = priorityConfig[reminder.priority] || priorityConfig.low
          const Icon = pcfg.icon
          const overdue = reminder.status === 'pending' && isOverdue(reminder.due_date)
          return (
            <div key={reminder.id} className={`premium-card p-5 flex items-start gap-4 group ${reminder.status === 'completed' ? 'opacity-60' : ''}`}>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                overdue ? 'bg-red-100 dark:bg-red-900/30' :
                reminder.priority === 'high' ? 'bg-orange-100 dark:bg-orange-900/30' :
                'bg-[hsl(var(--muted))]'
              }`}>
                <Icon className={`h-5 w-5 ${overdue ? 'text-red-600' : reminder.priority === 'high' ? 'text-orange-600' : 'text-[hsl(var(--muted-foreground))]'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <h3 className={`font-semibold text-sm ${reminder.status === 'completed' ? 'line-through' : ''}`}>{reminder.title}</h3>
                  <span className={`badge text-[10px] ${pcfg.cls}`}>{priorityLabel(reminder.priority)}</span>
                  <span className="badge text-[10px] badge-secondary capitalize">{typeLabel(reminder.type)}</span>
                  {overdue && <span className="badge text-[10px] badge-danger">{ar ? 'متأخرة' : 'Overdue'}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                  <div className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />{findClient(reminder.client_id)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />{reminder.due_date}
                  </div>
                </div>
                {reminder.notes && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{reminder.notes}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {reminder.status === 'pending' && (
                  <button onClick={() => handleComplete(reminder.id)} className="btn btn-ghost btn-xs text-emerald-600 hover:bg-emerald-50">
                    <CheckCircle2 className="h-4 w-4" /> {ar ? 'تم' : 'Done'}
                  </button>
                )}
                <button onClick={() => handleDelete(reminder.id)} className="btn btn-ghost btn-xs text-red-500 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)} dir={dir}>
          <div className="modal-content">
            <h2 className="text-xl font-bold mb-6">{ar ? 'تذكير جديد' : 'New Reminder'}</h2>
            <form onSubmit={handleCreate} className="space-y-4" id="reminderForm">
              <div className="form-group relative">
                <label className="form-label">{ar ? 'العميل' : 'Client'}</label>
                <select name="client_id" id="clientSelect" className="form-input" required>
                  <option value="">{ar ? 'اختر عميلاً…' : 'Select client...'}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{ar ? 'عنوان التذكير' : 'Reminder Title'}</label>
                <input name="title" className="form-input" placeholder={ar ? 'ما الذي يجب فعله؟' : 'What needs to be done?'} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">{ar ? 'النوع' : 'Type'}</label>
                  <select name="type" className="form-input">
                    <option value="call">{ar ? 'مكالمة' : 'Call'}</option>
                    <option value="email">{ar ? 'بريد إلكتروني' : 'Email'}</option>
                    <option value="meeting">{ar ? 'موعد / اجتماع' : 'Appointment / Meeting'}</option>
                    <option value="contract">{ar ? 'عقد' : 'Contract'}</option>
                    <option value="report">{ar ? 'تقرير' : 'Report'}</option>
                    <option value="payment">{ar ? 'دفع' : 'Payment'}</option>
                    <option value="other">{ar ? 'أخرى' : 'Other'}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{ar ? 'الأولوية' : 'Priority'}</label>
                  <select name="priority" className="form-input">
                    <option value="low">{ar ? 'منخفضة' : 'Low'}</option>
                    <option value="medium">{ar ? 'متوسطة' : 'Medium'}</option>
                    <option value="high">{ar ? 'عالية' : 'High'}</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{ar ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
                <input name="due_date" type="date" className="form-input" required />
              </div>
              <div className="form-group">
                <label className="form-label">{ar ? 'ملاحظات' : 'Notes'}</label>
                <textarea name="notes" className="form-input" placeholder={ar ? 'تفاصيل إضافية…' : 'Additional context...'} rows={3} />
              </div>
              <input type="hidden" name="status" value="pending" />
              <div className={`flex gap-3 ${ar ? 'justify-start' : 'justify-end'}`}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">{ar ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? (ar ? 'جاري الحفظ…' : 'Saving...') : (ar ? '✓ إنشاء التذكير' : '✓ Create Reminder')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
