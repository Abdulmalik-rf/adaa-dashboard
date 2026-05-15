import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { FileBadge, ExternalLink } from 'lucide-react'
import { UploadHrDocBox } from './UploadHrDocBox'

export const revalidate = 30

const T = {
  en: {
    pageTitle: 'HR Document Library',
    pageSub: 'Every employee document with an expiry date: passport scans, iqama copies, employment contracts, GOSI certs, medical insurance, etc. The expiry watchdog auto-tracks anything you upload here.',
    backLink: '← Back to HR',
    upload: 'Upload document',
    colEmployee: 'Employee', colType: 'Type', colNumber: 'Number', colIssued: 'Issued', colExpires: 'Expires', colFile: 'File',
    none: 'No documents tracked yet. Use the upload box above or forward a document PDF to the WhatsApp agent.',
  },
  ar: {
    pageTitle: 'مكتبة وثائق الموارد البشرية',
    pageSub: 'كل وثيقة موظف لها تاريخ انتهاء: نسخ الجوازات، الإقامات، عقود العمل، شهادات التأمينات والتأمين الطبي وغيرها. يتتبع نظام المراقبة تواريخ الانتهاء تلقائياً.',
    backLink: '← العودة',
    upload: 'رفع وثيقة',
    colEmployee: 'الموظف', colType: 'النوع', colNumber: 'الرقم', colIssued: 'تاريخ الإصدار', colExpires: 'تاريخ الانتهاء', colFile: 'الملف',
    none: 'لا توجد وثائق بعد. ارفع واحدة هنا أو أعد توجيهها إلى وكيل واتساب.',
  },
} as const

const typeLabel: Record<string, string> = {
  passport: 'Passport',
  iqama: 'Iqama',
  visa: 'Visa',
  national_id: 'National ID',
  employment_contract: 'Employment contract',
  gosi_certificate: 'GOSI cert',
  medical_insurance: 'Medical insurance',
  driving_license: 'Driving license',
  certificate: 'Certificate',
  other: 'Other',
}

export default async function HrDocumentsPage() {
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const ar = locale === 'ar'

  const [{ data: docs }, { data: emps }] = await Promise.all([
    (supabaseClient as any).from('hr_documents')
      .select('id, employee_id, doc_type, doc_number, issue_date, expiry_date, file_url, notes, team_members:employee_id (full_name, full_name_ar)')
      .order('expiry_date', { ascending: true, nullsFirst: false }),
    (supabaseClient as any).from('team_members')
      .select('id, full_name')
      .eq('status', 'active')
      .order('full_name'),
  ])

  const rows = (docs as any[]) ?? []
  const empsList = (emps as any[]) ?? []

  return (
    <div className="space-y-6 pb-10" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <FileBadge className="h-7 w-7 text-blue-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/hr" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">{t.backLink}</Link>
      </div>

      <UploadHrDocBox employees={empsList} ar={ar} title={t.upload} />

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
              <tr>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colEmployee}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colType}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colNumber}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colIssued}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colExpires}</th>
                <th className="px-3 py-2 text-right">{t.colFile}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-12 text-center text-xs italic text-[hsl(var(--muted-foreground))]">{t.none}</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.3)]">
                  <td className="px-3 py-2 font-semibold text-xs">{r.team_members?.full_name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{typeLabel[r.doc_type] ?? r.doc_type}</td>
                  <td className="px-3 py-2 text-xs font-mono">{r.doc_number || '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.issue_date || '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.expiry_date || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {r.file_url ? (
                      <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <ExternalLink className="h-3 w-3" /> {ar ? 'عرض' : 'View'}
                      </a>
                    ) : <span className="text-[10px] text-[hsl(var(--muted-foreground))]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
