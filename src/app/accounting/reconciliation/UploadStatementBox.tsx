'use client'

// Browser-direct upload to Supabase Storage (bucket 'content-uploads'),
// then hand the resulting storage path to the server action. This bypasses
// the Hostinger reverse-proxy 19MB body cap that was clobbering server-side
// uploads.

import { useState, useRef, useTransition } from 'react'
import { Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { ingestBankStatement } from '@/app/actions/bank-reconciliation'

const BUCKET = 'content-uploads'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export function UploadStatementBox({
  ar,
  t,
}: {
  ar: boolean
  t: { title: string; hint: string; pickFile: string }
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [bankName, setBankName] = useState('')
  const [accountLabel, setAccountLabel] = useState('')
  const [accountIban, setAccountIban] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [progress, setProgress] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<{ tx: number; id: string } | null>(null)

  async function handleUpload() {
    setError(null); setOk(null); setProgress('')
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError(ar ? 'اختر ملف PDF أولاً.' : 'Pick a PDF first.')
      return
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError(ar ? 'يجب أن يكون الملف PDF.' : 'Must be a PDF.')
      return
    }

    setUploading(true)
    try {
      setProgress(ar ? 'جارٍ رفع الكشف…' : 'Uploading…')
      // Browser-direct upload — server never sees the bytes
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON)
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80)
      const path = `bank-statements/${Date.now()}-${safeName}`
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, {
        contentType: 'application/pdf',
        upsert: false,
      })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
      setProgress(ar ? 'جارٍ استخراج العمليات…' : 'Extracting transactions…')

      startTransition(async () => {
        const r = await ingestBankStatement({
          file_path: path,
          bank_name: bankName || null,
          account_label: accountLabel || null,
          account_iban: accountIban || null,
        })
        setUploading(false)
        if (!r.ok) {
          setError(r.error)
        } else {
          setOk({ tx: r.tx_count, id: r.upload_id })
          setTimeout(() => router.push(`/accounting/reconciliation/${r.upload_id}`), 800)
        }
      })
    } catch (e: any) {
      setUploading(false)
      setError(e?.message ?? 'Unexpected error')
    }
  }

  const busy = uploading || pending

  return (
    <div className="premium-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
            <Upload className="h-4 w-4 text-emerald-500" /> {t.title}
          </h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 max-w-2xl">{t.hint}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
            {ar ? 'البنك' : 'Bank'}
          </label>
          <input
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder={ar ? 'الراجحي / الأهلي / الرياض…' : 'Al Rajhi / SNB / Riyad…'}
            className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
            {ar ? 'اسم الحساب' : 'Account label'}
          </label>
          <input
            type="text"
            value={accountLabel}
            onChange={(e) => setAccountLabel(e.target.value)}
            placeholder={ar ? 'الحساب الرئيسي…' : 'Main account…'}
            className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
            IBAN
          </label>
          <input
            type="text"
            value={accountIban}
            onChange={(e) => setAccountIban(e.target.value)}
            placeholder="SA00 0000 0000 0000 0000 0000"
            className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input ref={fileRef} type="file" accept="application/pdf" className="text-sm" />
        <button
          onClick={handleUpload}
          disabled={busy}
          className="btn btn-primary inline-flex items-center gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {t.pickFile}
        </button>
        {progress && <span className="text-xs text-[hsl(var(--muted-foreground))]">{progress}</span>}
      </div>

      {ok && (
        <div className="mt-3 text-sm bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-l-emerald-500 px-3 py-2 rounded flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold">
            {ar ? `استخرجنا ${ok.tx} عملية. جاري التحويل…` : `Extracted ${ok.tx} transactions. Redirecting…`}
          </span>
        </div>
      )}
      {error && (
        <div className="mt-3 text-sm bg-red-50 dark:bg-red-900/20 border-l-4 border-l-red-500 px-3 py-2 rounded flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
