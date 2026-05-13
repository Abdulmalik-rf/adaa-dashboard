'use client'

import { useState } from 'react'
import { ListChecks, Plus, Trash2, X, Loader2, Pencil } from 'lucide-react'
import { updateContractPlan } from '@/app/actions/contracts'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const STRINGS = {
  en: {
    editPlan: 'Edit plan',
    scopeLabel: 'Scope / what this covers',
    scopePh: 'e.g. Monthly social media management on Instagram + TikTok.',
    deliverables: 'Deliverables',
    addItem: 'Add item',
    emptyHint: 'No items yet — click Add item to itemize what\'s owed.',
    titlePh: 'Title (e.g. 12 IG posts/month)',
    detailPh: 'Detail / spec (optional)',
    markDone: 'Mark as done',
    markPending: 'Mark as pending',
    cancel: 'Cancel',
    save: 'Save plan',
    saving: 'Saving…',
    saveFailed: 'Save failed',
  },
  ar: {
    editPlan: 'تعديل الخطة',
    scopeLabel: 'نطاق العمل / ما يغطيه',
    scopePh: 'مثال: إدارة سوشيال ميديا شهرية على إنستجرام + تيك توك.',
    deliverables: 'المخرجات',
    addItem: 'إضافة بند',
    emptyHint: 'لا توجد بنود بعد — اضغط "إضافة بند" لإدراج ما هو مطلوب.',
    titlePh: 'العنوان (مثال: ١٢ منشور إنستجرام/الشهر)',
    detailPh: 'تفاصيل / مواصفات (اختياري)',
    markDone: 'تحديد كمنجز',
    markPending: 'تحديد كمعلق',
    cancel: 'إلغاء',
    save: 'حفظ الخطة',
    saving: 'جاري الحفظ…',
    saveFailed: 'فشل الحفظ',
  },
} as const

type Deliverable = { id: string; title: string; detail?: string; status?: string }

const uid = () => Math.random().toString(36).slice(2, 9)

export function EditContractPlanModal({
  contractId,
  clientId,
  contractTitle,
  initialScope,
  initialDeliverables,
}: {
  contractId: string
  clientId: string
  contractTitle: string
  initialScope: string | null
  initialDeliverables: Deliverable[]
}) {
  const { language, dir } = useLanguage()
  const T = STRINGS[language === 'ar' ? 'ar' : 'en']
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState(initialScope ?? '')
  const [items, setItems] = useState<Deliverable[]>(
    Array.isArray(initialDeliverables)
      ? initialDeliverables.map((d) => ({
          id: d?.id || uid(),
          title: d?.title ?? '',
          detail: d?.detail ?? '',
          status: d?.status ?? 'pending',
        }))
      : [],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addRow() {
    setItems((d) => [...d, { id: uid(), title: '', detail: '', status: 'pending' }])
  }
  function updateRow(id: string, patch: Partial<Deliverable>) {
    setItems((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function removeRow(id: string) {
    setItems((d) => d.filter((r) => r.id !== id))
  }
  function toggleDone(id: string) {
    setItems((d) =>
      d.map((r) => (r.id === id ? { ...r, status: r.status === 'done' ? 'pending' : 'done' } : r)),
    )
  }

  function close() {
    setOpen(false)
    setError(null)
    // Reset to the props so reopening doesn't show stale edits.
    setScope(initialScope ?? '')
    setItems(
      Array.isArray(initialDeliverables)
        ? initialDeliverables.map((d) => ({
            id: d?.id || uid(),
            title: d?.title ?? '',
            detail: d?.detail ?? '',
            status: d?.status ?? 'pending',
          }))
        : [],
    )
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const clean = items
        .filter((d) => d.title.trim())
        .map((d) => ({
          id: d.id,
          title: d.title.trim(),
          detail: d.detail?.trim() || undefined,
          status: d.status || 'pending',
        }))
      await updateContractPlan(contractId, clientId, scope.trim() || null, clean)
      setOpen(false)
    } catch (err: any) {
      setError(err?.message ?? T.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold px-2 py-1 rounded-lg bg-[hsl(var(--muted)/0.4)] hover:bg-[hsl(var(--primary)/0.15)] hover:text-[hsl(var(--primary))] flex items-center gap-1.5 transition-colors"
      >
        <Pencil className="h-3 w-3" /> {T.editPlan}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" dir={dir}>
      <div className="bg-[hsl(var(--card))] w-full max-w-xl rounded-2xl shadow-2xl border border-[hsl(var(--border))] overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[hsl(var(--border))] flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[hsl(var(--primary))]" /> {T.editPlan}
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{contractTitle}</p>
          </div>
          <button onClick={close} disabled={saving} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-sm font-semibold">{T.scopeLabel}</label>
            <textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              rows={3}
              placeholder={T.scopePh}
              className="form-input resize-none"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-[hsl(var(--primary))]" /> {T.deliverables}
              </label>
              <button
                type="button"
                onClick={addRow}
                disabled={saving}
                className="text-xs font-semibold px-2 py-1 rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)] flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> {T.addItem}
              </button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))] italic px-3 py-3 rounded-lg bg-[hsl(var(--muted)/0.4)] border border-dashed border-[hsl(var(--border))]">
                {T.emptyHint}
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((d, i) => {
                  const done = d.status === 'done'
                  return (
                    <div key={d.id} className="flex gap-2 items-start p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
                      <button
                        type="button"
                        onClick={() => toggleDone(d.id)}
                        disabled={saving}
                        title={done ? T.markPending : T.markDone}
                        className={`mt-1 inline-flex h-5 w-5 flex-shrink-0 rounded items-center justify-center border text-[10px] transition-colors ${
                          done
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary))]'
                        }`}
                      >
                        {done ? '✓' : ''}
                      </button>
                      <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] w-4 pt-2 text-center">{i + 1}</span>
                      <div className="flex-1 space-y-1.5">
                        <input
                          value={d.title}
                          onChange={(e) => updateRow(d.id, { title: e.target.value })}
                          placeholder={T.titlePh}
                          disabled={saving}
                          className={`form-input text-sm ${done ? 'line-through opacity-60' : ''}`}
                        />
                        <input
                          value={d.detail ?? ''}
                          onChange={(e) => updateRow(d.id, { detail: e.target.value })}
                          placeholder={T.detailPh}
                          disabled={saving}
                          className="form-input text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(d.id)}
                        disabled={saving}
                        className="text-[hsl(var(--muted-foreground))] hover:text-red-500 p-1.5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600">{error}</div>
          )}
        </div>

        <div className="border-t border-[hsl(var(--border))] p-4 flex gap-2 flex-shrink-0">
          <button type="button" onClick={close} disabled={saving} className="btn btn-secondary flex-1">{T.cancel}</button>
          <button type="button" onClick={save} disabled={saving} className="btn btn-primary flex-1">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> {T.saving}</> : T.save}
          </button>
        </div>
      </div>
    </div>
  )
}
