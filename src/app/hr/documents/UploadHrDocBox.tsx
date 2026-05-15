'use client'

// Browser-direct upload to Supabase Storage → server action records the
// metadata. Bypasses the Hostinger reverse-proxy body cap.

import { useState, useRef, useTransition } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { recordHrDocument } from '@/app/actions/hr-automation'

const BUCKET = 'content-uploads'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const DOC_TYPES = [
  'passport', 'iqama', 'visa', 'national_id', 'employment_contract',
  'gosi_certificate', 'medical_insurance', 'driving_license', 'certificate', 'other',
]

export function UploadHrDocBox({
  employees,
  ar,
  title,
}: {
  employees: Array<{ id: string; full_name: string }>
  ar: boolean
  title: string
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [employeeId, setEmployeeId] = useState('')
  const [docType, setDocType] = useState('iqama')
  const [docNumber, setDocNumber] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function upload() {
    if (!employeeId) { setErr(ar ? 'اختر موظفاً' : 'Pick an employee'); return }
    const file = fileRef.current?.files?.[0]
    if (!file) { setErr(ar ? 'اختر ملف' : 'Pick a file'); return }

    setErr(null); setInfo(null)
    setUploading(true)
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON)
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80)
      const path = `hr-documents/${employeeId}/${Date.now()}-${safe}`
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
      const file_url = pub?.publicUrl ?? path

      startTransition(async () => {
        const r = await recordHrDocument({
          employee_id: employeeId,
          doc_type: docType,
          file_path: path,
          file_url,
          doc_number: docNumber || undefined,
          issue_date: issueDate || undefined,
          expiry_date: expiryDate || undefined,
          notes: notes || undefined,
        })
        setUploading(false)
        if (!r.ok) setErr(r.error)
        else {
          setInfo(ar ? '✓ تم الرفع والتسجيل' : '✓ Uploaded + recorded')
          setDocNumber(''); setIssueDate(''); setExpiryDate(''); setNotes('')
          if (fileRef.current) fileRef.current.value = ''
          router.refresh()
        }
      })
    } catch (e: any) {
      setUploading(false)
      setErr(e?.message ?? 'Unexpected error')
    }
  }

  const busy = uploading || pending

  return (
    <div className="premium-card p-4 space-y-3">
      <h3 className="font-bold text-sm uppercase tracking-wider">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{ar ? 'الموظف' : 'Employee'}</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm">
            <option value="">— {ar ? 'اختر' : 'Pick'} —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{ar ? 'نوع الوثيقة' : 'Doc type'}</label>
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm">
            {DOC_TYPES.map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{ar ? 'الرقم' : 'Number'}</label>
          <input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="2123456789" className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{ar ? 'تاريخ الإصدار' : 'Issue date'}</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{ar ? 'تاريخ الانتهاء' : 'Expiry date'}</label>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">{ar ? 'ملاحظات' : 'Notes'}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent px-3 text-sm" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="text-sm" />
        <button onClick={upload} disabled={busy} className="btn btn-primary inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {ar ? 'رفع' : 'Upload'}
        </button>
        {info && <span className="text-xs text-emerald-600 font-semibold">{info}</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  )
}
