'use client'

import { useState, useTransition } from 'react'
import { Save, Loader2, Send, X } from 'lucide-react'
import { updateHrLetter } from '@/app/actions/hr-automation'

export function LetterEditor({ letter, ar }: { letter: any; ar: boolean }) {
  const editable = letter.status === 'draft'
  const [bodyEn, setBodyEn] = useState<string>(letter.body_en ?? '')
  const [bodyAr, setBodyAr] = useState<string>(letter.body_ar ?? '')
  const [pendingSave, startSave] = useTransition()
  const [pendingSend, startSend] = useTransition()
  const [pendingVoid, startVoid] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function save() {
    setErr(null); setInfo(null)
    startSave(async () => {
      const r = await updateHrLetter({ id: letter.id, body_en: bodyEn, body_ar: bodyAr })
      if (!r.ok) setErr(r.error)
      else setInfo(ar ? '✓ تم الحفظ' : '✓ Saved')
    })
  }
  function send(channel: 'email' | 'whatsapp' | 'in_person') {
    if (!confirm(ar ? 'تأكيد الإرسال؟ ستصبح الحالة "مُرسلة".' : 'Confirm send? Status will flip to "sent".')) return
    setErr(null); setInfo(null)
    startSend(async () => {
      const r = await updateHrLetter({ id: letter.id, status: 'sent', delivered_channel: channel })
      if (!r.ok) setErr(r.error)
      else setInfo(ar ? '✓ تم تحديث الحالة' : '✓ Marked sent')
    })
  }
  function voidIt() {
    if (!confirm(ar ? 'إلغاء الخطاب؟' : 'Void this letter?')) return
    setErr(null); setInfo(null)
    startVoid(async () => {
      const r = await updateHrLetter({ id: letter.id, status: 'void' })
      if (!r.ok) setErr(r.error)
      else setInfo(ar ? '✓ ملغى' : '✓ Voided')
    })
  }

  return (
    <>
      <div className="premium-card p-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[hsl(var(--muted-foreground))]">Status:</span>
        <span className="font-bold uppercase">{letter.status}</span>
        {letter.delivered_at && <><span>·</span><span>delivered {new Date(letter.delivered_at).toLocaleString()}</span></>}
        {letter.reference_clauses?.length > 0 && (
          <><span className="mx-1">·</span><span className="text-[hsl(var(--muted-foreground))]">refs: {letter.reference_clauses.join(', ')}</span></>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="premium-card p-4">
          <h3 className="font-bold text-xs uppercase tracking-wider mb-2">English</h3>
          {editable ? (
            <textarea
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              rows={20}
              className="w-full text-sm rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 py-2 leading-relaxed font-mono"
            />
          ) : (
            <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words font-sans">{bodyEn}</pre>
          )}
        </div>
        <div className="premium-card p-4" dir="rtl">
          <h3 className="font-bold text-xs uppercase tracking-wider mb-2">العربية</h3>
          {editable ? (
            <textarea
              value={bodyAr}
              onChange={(e) => setBodyAr(e.target.value)}
              rows={20}
              className="w-full text-sm rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 py-2 leading-relaxed font-mono"
            />
          ) : (
            <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words font-sans">{bodyAr}</pre>
          )}
        </div>
      </div>

      {editable && (
        <div className="premium-card p-4 flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={pendingSave} className="btn btn-secondary inline-flex items-center gap-1.5">
            {pendingSave ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {ar ? 'حفظ' : 'Save edits'}
          </button>
          <span className="mx-2 text-[hsl(var(--muted-foreground))]">·</span>
          <button onClick={() => send('email')} disabled={pendingSend} className="btn btn-primary inline-flex items-center gap-1.5">
            {pendingSend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {ar ? 'أُرسلت عبر البريد' : 'Mark sent · email'}
          </button>
          <button onClick={() => send('whatsapp')} disabled={pendingSend} className="btn btn-primary inline-flex items-center gap-1.5">
            {pendingSend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {ar ? 'أُرسلت عبر واتساب' : 'Mark sent · WA'}
          </button>
          <button onClick={() => send('in_person')} disabled={pendingSend} className="btn btn-primary inline-flex items-center gap-1.5">
            {pendingSend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {ar ? 'سُلمت يدوياً' : 'Mark sent · in person'}
          </button>
          <span className="mx-2 text-[hsl(var(--muted-foreground))]">·</span>
          <button onClick={voidIt} disabled={pendingVoid} className="btn btn-ghost text-red-600 inline-flex items-center gap-1.5">
            {pendingVoid ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            {ar ? 'إلغاء' : 'Void'}
          </button>
          {info && <span className="text-xs text-emerald-600 font-semibold">{info}</span>}
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      )}
    </>
  )
}
