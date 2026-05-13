'use client'

// Lazy wrappers for the three heaviest modals on /clients/[id].
// Each renders only a cheap trigger button until the user clicks it; the
// real modal's code chunk is fetched on-demand via next/dynamic. This
// trims the initial client bundle for the workspace page meaningfully —
// SubmitPostModal alone pulls in object-URL preview logic + form refs
// + ~250 lines of JSX, and UploadFileInline pulls in
// @supabase/supabase-js for the browser-direct upload.
//
// Mechanic: the wrapper holds an `armed` boolean. When the trigger is
// clicked, `armed` flips true → the dynamic component mounts → its
// `defaultOpen=true` prop makes the modal appear immediately (no
// double-click). When the modal calls `onClose`, `armed` flips back
// false so the wrapper unmounts the modal again. The chunk stays in
// the browser cache for the rest of the session.

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Upload, Pencil, Plus } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

// ---------- Files: UploadFileInline -----------------------------------------

const UploadFileInline = dynamic(
  () => import('./UploadFileInline').then((m) => ({ default: m.UploadFileInline })),
  { ssr: false, loading: () => null },
)

export function UploadFileInlineLazy(props: {
  clientId: string
  existingCategories: string[]
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return (
      <button onClick={() => setArmed(true)} className="btn btn-primary btn-sm">
        <Upload className="h-4 w-4" /> {ar ? 'رفع ملف' : 'Upload file'}
      </button>
    )
  }
  return <UploadFileInline {...props} defaultOpen onClose={() => setArmed(false)} />
}

// ---------- Contracts: EditContractPlanModal --------------------------------

const EditContractPlanModal = dynamic(
  () => import('./EditContractPlanModal').then((m) => ({ default: m.EditContractPlanModal })),
  { ssr: false, loading: () => null },
)

export function EditContractPlanModalLazy(props: {
  contractId: string
  clientId: string
  contractTitle: string
  initialScope: string | null
  initialDeliverables: Array<{ id: string; title: string; detail?: string; status?: string }>
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="text-xs font-semibold px-2 py-1 rounded-lg bg-[hsl(var(--muted)/0.4)] hover:bg-[hsl(var(--primary)/0.15)] hover:text-[hsl(var(--primary))] flex items-center gap-1.5 transition-colors"
      >
        <Pencil className="h-3 w-3" /> {ar ? 'تعديل الخطة' : 'Edit plan'}
      </button>
    )
  }
  return <EditContractPlanModal {...props} defaultOpen onClose={() => setArmed(false)} />
}

// ---------- Content: SubmitPostModal ----------------------------------------

const SubmitPostModal = dynamic(
  () => import('@/app/content/SubmitPostModal').then((m) => ({ default: m.SubmitPostModal })),
  { ssr: false, loading: () => null },
)

export function SubmitPostModalLazy(props: { clients: Array<{ id: string; company_name: string }> }) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const [armed, setArmed] = useState(false)
  if (!armed) {
    // Match the styling of the original Button trigger so layout doesn't shift.
    return (
      <button
        onClick={() => setArmed(true)}
        className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
      >
        <Plus className="mx-2 h-4 w-4" /> {ar ? 'إرسال منشور للمراجعة' : 'Submit Post for Review'}
      </button>
    )
  }
  return <SubmitPostModal {...props} defaultOpen onClose={() => setArmed(false)} />
}
