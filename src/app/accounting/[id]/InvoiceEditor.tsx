'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Save, Loader2 } from 'lucide-react'
import { updateDraftInvoice } from '@/app/actions/invoices'

type Line = { description: string; qty: number; unit_price: number; vat_rate: number; vat_amount?: number; line_total?: number }

export function InvoiceEditor({ invoice, ar }: { invoice: any; ar: boolean }) {
  const editable = invoice.status === 'draft'
  const [lines, setLines] = useState<Line[]>(() => {
    const raw = Array.isArray(invoice.line_items) ? invoice.line_items : []
    return raw.map((l: any) => ({
      description: l.description || '',
      qty: Number(l.qty ?? 1),
      unit_price: Number(l.unit_price ?? 0),
      vat_rate: Number(l.vat_rate ?? invoice.vat_rate ?? 15),
      vat_amount: Number(l.vat_amount ?? 0),
      line_total: Number(l.line_total ?? 0),
    }))
  })
  const [saving, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  function recalc(arr: Line[]): Line[] {
    return arr.map((l) => {
      const subtotal = Number(l.qty || 0) * Number(l.unit_price || 0)
      const vat = Math.round(subtotal * Number(l.vat_rate || 0)) / 100
      return { ...l, vat_amount: vat, line_total: subtotal }
    })
  }

  function addLine() {
    setLines((arr) => [...arr, { description: '', qty: 1, unit_price: 0, vat_rate: Number(invoice.vat_rate ?? 15), vat_amount: 0, line_total: 0 }])
  }

  function update(idx: number, patch: Partial<Line>) {
    setLines((arr) => recalc(arr.map((l, i) => (i === idx ? { ...l, ...patch } : l))))
  }

  function remove(idx: number) {
    setLines((arr) => arr.filter((_, i) => i !== idx))
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const r = await updateDraftInvoice(invoice.id, { line_items: recalc(lines), vat_rate: Number(invoice.vat_rate ?? 15) })
      if (!r.ok) setError(r.error)
      else setSavedAt(Date.now())
    })
  }

  return (
    <div className="premium-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
        <h3 className="font-bold text-sm uppercase tracking-wider">{ar ? 'بنود الفاتورة' : 'Line items'}</h3>
        {editable && (
          <div className="flex items-center gap-2">
            {savedAt && Date.now() - savedAt < 4000 && (
              <span className="text-[10px] text-emerald-600 font-semibold">{ar ? '✓ تم الحفظ' : '✓ Saved'}</span>
            )}
            <button onClick={addLine} className="btn btn-ghost btn-xs">
              <Plus className="h-3 w-3" /> {ar ? 'إضافة بند' : 'Add line'}
            </button>
            <button onClick={save} disabled={saving} className="btn btn-primary btn-xs">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {ar ? 'حفظ' : 'Save'}
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
            <tr>
              <th className="px-3 py-2 text-left">{ar ? 'الوصف' : 'Description'}</th>
              <th className="px-3 py-2 text-right w-16">{ar ? 'الكمية' : 'Qty'}</th>
              <th className="px-3 py-2 text-right w-28">{ar ? 'السعر' : 'Unit price'}</th>
              <th className="px-3 py-2 text-right w-20">{ar ? 'الضريبة %' : 'VAT %'}</th>
              <th className="px-3 py-2 text-right w-28">{ar ? 'الإجمالي' : 'Line total'}</th>
              {editable && <th className="px-3 py-2 w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-[hsl(var(--border))]">
                <td className="px-3 py-2">
                  {editable ? (
                    <input
                      value={l.description}
                      onChange={(e) => update(i, { description: e.target.value })}
                      className="w-full bg-transparent border-b border-transparent hover:border-[hsl(var(--border))] focus:border-[hsl(var(--primary))] focus:outline-none px-1 py-0.5 text-sm"
                      placeholder={ar ? 'وصف البند…' : 'Line description…'}
                    />
                  ) : (
                    <span>{l.description || '—'}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {editable ? (
                    <input
                      type="number" min="0" step="1"
                      value={l.qty}
                      onChange={(e) => update(i, { qty: Number(e.target.value) })}
                      className="w-14 bg-transparent border-b border-transparent hover:border-[hsl(var(--border))] focus:border-[hsl(var(--primary))] focus:outline-none px-1 py-0.5 text-sm text-right"
                    />
                  ) : (
                    <span>{l.qty}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {editable ? (
                    <input
                      type="number" min="0" step="0.01"
                      value={l.unit_price}
                      onChange={(e) => update(i, { unit_price: Number(e.target.value) })}
                      className="w-24 bg-transparent border-b border-transparent hover:border-[hsl(var(--border))] focus:border-[hsl(var(--primary))] focus:outline-none px-1 py-0.5 text-sm text-right"
                    />
                  ) : (
                    <span>{Number(l.unit_price).toLocaleString('en-US')}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {editable ? (
                    <input
                      type="number" min="0" step="0.5"
                      value={l.vat_rate}
                      onChange={(e) => update(i, { vat_rate: Number(e.target.value) })}
                      className="w-16 bg-transparent border-b border-transparent hover:border-[hsl(var(--border))] focus:border-[hsl(var(--primary))] focus:outline-none px-1 py-0.5 text-sm text-right"
                    />
                  ) : (
                    <span>{l.vat_rate}%</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-semibold">{Number(l.line_total ?? 0).toLocaleString('en-US')}</td>
                {editable && (
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(i)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={editable ? 6 : 5} className="px-3 py-8 text-center text-xs text-[hsl(var(--muted-foreground))] italic">
                  {ar ? 'لا توجد بنود — أضف على الأقل بنداً واحداً قبل الاعتماد.' : 'No line items — add at least one before approving.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && (
        <div className="px-5 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}
