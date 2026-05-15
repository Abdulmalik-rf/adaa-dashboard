'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Mail, X, AlertOctagon, Loader2, MessageSquare, Receipt } from 'lucide-react'
import { sendNagByEmail, skipNag, rejectNag, editDraftNag } from '@/app/actions/nags'

export function NagRow({
  nag,
  ar,
  stageLabel,
  stageColor,
}: {
  nag: any
  ar: boolean
  stageLabel: string
  stageColor: string
}) {
  const [draft, setDraft] = useState<string>(nag.draft_text ?? '')
  const [editingDraft, setEditingDraft] = useState(false)
  const [pendingEdit, startEdit] = useTransition()
  const [pendingSend, startSend] = useTransition()
  const [pendingSkip, startSkip] = useTransition()
  const [pendingReject, startReject] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function saveDraft() {
    setErr(null); setInfo(null)
    startEdit(async () => {
      const r = await editDraftNag(nag.id, draft)
      if (!r.ok) setErr(r.error)
      else { setInfo(ar ? '✓ تم حفظ المسودة' : '✓ Draft saved'); setEditingDraft(false) }
    })
  }

  function sendEmail() {
    if (!confirm(ar ? `إرسال الرسالة بالبريد إلى عميل الفاتورة ${nag.invoice?.invoice_number}؟` : `Send this draft via email to the client of invoice ${nag.invoice?.invoice_number}?`)) return
    setErr(null); setInfo(null)
    startSend(async () => {
      const r = await sendNagByEmail(nag.id, draft)
      if (!r.ok) setErr(r.error)
      else setInfo(ar ? '✓ تم الإرسال' : '✓ Sent')
    })
  }

  function skip() {
    if (!confirm(ar ? 'تخطي هذه المسودة؟ لن تُرسل.' : 'Skip this draft? It will not be sent.')) return
    setErr(null)
    startSkip(async () => {
      const r = await skipNag(nag.id)
      if (!r.ok) setErr(r.error)
    })
  }

  function reject() {
    if (!confirm(ar ? 'رفض المسودة؟' : 'Reject this draft?')) return
    setErr(null)
    startReject(async () => {
      const r = await rejectNag(nag.id)
      if (!r.ok) setErr(r.error)
    })
  }

  const busy = pendingEdit || pendingSend || pendingSkip || pendingReject

  return (
    <div className={`premium-card overflow-hidden border-l-4 ${stageColor}`}>
      <div className="p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <Receipt className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <Link href={`/accounting/${nag.invoice?.id ?? ''}`} className="font-bold text-[hsl(var(--primary))] hover:underline">
              {nag.invoice?.invoice_number ?? '—'}
            </Link>
            <span className="text-[hsl(var(--muted-foreground))]">·</span>
            <span className="font-semibold">{nag.invoice?.customer_name ?? '—'}</span>
            <span className="text-[hsl(var(--muted-foreground))]">·</span>
            <span className="font-bold">
              {Number(nag.invoice?.total ?? 0).toLocaleString('en-US')} {nag.invoice?.currency || 'SAR'}
            </span>
            <span className="badge text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 ml-2">
              {stageLabel}
            </span>
          </div>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
            {ar ? 'تاريخ الإصدار' : 'Issued'}: {nag.invoice?.issue_date ?? '—'}
          </p>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Editable draft */}
        {editingDraft ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full text-sm rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 py-2 leading-relaxed"
          />
        ) : (
          <pre className="bg-[hsl(var(--muted)/0.25)] rounded p-3 text-xs leading-relaxed whitespace-pre-wrap break-words font-sans">
            {draft}
          </pre>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {editingDraft ? (
            <>
              <button onClick={saveDraft} disabled={busy} className="btn btn-primary btn-xs">
                {pendingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {ar ? 'حفظ' : 'Save'}
              </button>
              <button onClick={() => { setEditingDraft(false); setDraft(nag.draft_text ?? '') }} className="btn btn-ghost btn-xs">
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
            </>
          ) : (
            <button onClick={() => setEditingDraft(true)} className="btn btn-ghost btn-xs">
              {ar ? 'تعديل النص' : 'Edit text'}
            </button>
          )}

          <span className="mx-1 text-[hsl(var(--muted-foreground))]">·</span>

          <button onClick={sendEmail} disabled={busy} className="btn btn-primary btn-xs inline-flex items-center gap-1">
            {pendingSend ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
            {ar ? 'إرسال بالبريد' : 'Send via email'}
          </button>
          <span className="text-[10px] text-[hsl(var(--muted-foreground))] inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {ar ? 'أو رد بـ "send" على واتساب' : 'or reply "send" on WhatsApp'}
          </span>

          <span className="mx-1 text-[hsl(var(--muted-foreground))]">·</span>

          <button onClick={skip} disabled={busy} className="btn btn-ghost btn-xs inline-flex items-center gap-1">
            {pendingSkip ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            {ar ? 'تخطي' : 'Skip'}
          </button>
          <button onClick={reject} disabled={busy} className="btn btn-ghost btn-xs inline-flex items-center gap-1 text-red-600">
            {pendingReject ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertOctagon className="h-3 w-3" />}
            {ar ? 'رفض' : 'Reject'}
          </button>
        </div>

        {info && <p className="text-xs text-emerald-600 font-semibold">{info}</p>}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </div>
  )
}
