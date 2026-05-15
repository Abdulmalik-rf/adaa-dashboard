'use client'

// Category + due-date + payment metadata editor. Visible always (so admin
// can read the values when not editable); editable when status='draft'.
// The category control also shows a "you usually classify this vendor
// as X" hint, lifted from expense_category_mappings.

import { useState, useTransition } from 'react'
import { Save, Loader2, Tag, CalendarClock } from 'lucide-react'
import { updateDraftBill } from '@/app/actions/bills'

// A short, stable list of categories. New free-text values still work
// (the schema accepts any string) — these are just the fast-clicks.
const CATEGORIES = [
  'meals', 'fuel', 'transport', 'software', 'subscriptions',
  'office_supplies', 'rent', 'utilities', 'marketing', 'professional_fees',
  'salaries', 'training', 'travel', 'cloud_hosting', 'misc',
]

export function BillMetaEditor({
  bill,
  categoryHint,
  ar,
  t,
}: {
  bill: any
  categoryHint: { category: string; hit_count: number } | null
  ar: boolean
  t: {
    category: string
    usuallyClassified: string
    billNumber: string
    dueDate: string
    paymentDate: string
  }
}) {
  const editable = bill.status === 'draft'
  const [category, setCategory] = useState<string>(bill.category ?? '')
  const [customCat, setCustomCat] = useState<string>('')
  const [dueDate, setDueDate] = useState<string>(bill.due_date ?? '')
  const [paymentDate, setPaymentDate] = useState<string>(bill.payment_date ?? '')
  const [paymentMethod, setPaymentMethod] = useState<string>(bill.payment_method ?? '')
  const [paymentReference, setPaymentReference] = useState<string>(bill.payment_reference ?? '')
  const [saving, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  function save() {
    setError(null)
    const finalCat = (customCat.trim() || category.trim() || null) as string | null
    startTransition(async () => {
      const r = await updateDraftBill(bill.id, {
        category: finalCat,
        due_date: dueDate || null,
        payment_date: paymentDate || null,
        payment_method: paymentMethod || null,
        payment_reference: paymentReference || null,
      })
      if (!r.ok) setError(r.error)
      else setSavedAt(Date.now())
    })
  }

  if (!editable) {
    // Read-only — show a compact summary instead of editing controls
    return (
      <div className="premium-card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-indigo-500" />
          <span className="text-[hsl(var(--muted-foreground))]">{t.category}:</span>
          <span className="font-bold">{bill.category || '—'}</span>
        </div>
        {bill.due_date && (
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-amber-500" />
            <span className="text-[hsl(var(--muted-foreground))]">{t.dueDate}:</span>
            <span className="font-bold">{bill.due_date}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="premium-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm uppercase tracking-wider">
          <Tag className="inline h-4 w-4 mr-1.5 text-indigo-500" />
          {t.category} & {ar ? 'مواعيد الدفع' : 'payment dates'}
        </h3>
        <div className="flex items-center gap-2">
          {savedAt && Date.now() - savedAt < 4000 && (
            <span className="text-[10px] text-emerald-600 font-semibold">{ar ? '✓ تم الحفظ' : '✓ Saved'}</span>
          )}
          <button onClick={save} disabled={saving} className="btn btn-primary btn-xs">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {ar ? 'حفظ' : 'Save'}
          </button>
        </div>
      </div>

      {categoryHint && categoryHint.category && categoryHint.category !== category && (
        <div className="text-[11px] bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-l-indigo-500 px-3 py-2 rounded">
          <span className="text-[hsl(var(--muted-foreground))]">{t.usuallyClassified}:</span>{' '}
          <button
            type="button"
            onClick={() => { setCategory(categoryHint.category); setCustomCat('') }}
            className="font-bold text-indigo-700 dark:text-indigo-300 hover:underline">
            {categoryHint.category}
          </button>
          <span className="text-[hsl(var(--muted-foreground))] ml-2">
            ({categoryHint.hit_count}× {ar ? 'مرات سابقة' : 'past matches'})
          </span>
        </div>
      )}

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1.5">
          {t.category}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setCategory(c); setCustomCat('') }}
              className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                category === c && !customCat
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-indigo-500 hover:text-indigo-600'
              }`}>
              {c}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={customCat}
          onChange={(e) => setCustomCat(e.target.value)}
          placeholder={ar ? 'أو تصنيف مخصص…' : 'or a custom category…'}
          className="mt-2 w-full max-w-xs h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
            {t.dueDate}
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
            {t.paymentDate}
          </label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
            {ar ? 'طريقة الدفع' : 'Payment method'}
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm">
            <option value="">—</option>
            <option value="bank_transfer">{ar ? 'تحويل بنكي' : 'Bank transfer'}</option>
            <option value="cash">{ar ? 'نقدي' : 'Cash'}</option>
            <option value="card">{ar ? 'بطاقة' : 'Card'}</option>
            <option value="cheque">{ar ? 'شيك' : 'Cheque'}</option>
            <option value="mada">Mada</option>
            <option value="stc_pay">STC Pay</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
            {ar ? 'مرجع الدفع' : 'Payment reference'}
          </label>
          <input
            type="text"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm"
            placeholder={ar ? 'رقم العملية…' : 'Transaction id…'}
          />
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">
          {error}
        </div>
      )}
    </div>
  )
}
