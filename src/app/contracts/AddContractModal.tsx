"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, X, FileSignature, Building, Calendar, DollarSign, ListChecks, Trash2 } from "lucide-react"
import { createContract } from "@/app/actions/contracts"
import { useLanguage } from "@/lib/i18n/LanguageContext"

const STRINGS = {
  en: {
    newContract: 'New Contract',
    title: 'Create Contract',
    contractTitle: 'Contract Title',
    contractTitlePh: 'e.g. Social Media Management 2024',
    client: 'Client',
    selectClient: 'Select Client',
    typeLabel: 'Type',
    retainer: 'Retainer',
    project: 'Project',
    oneTime: 'One-time',
    startDate: 'Start Date',
    endDate: 'End Date',
    value: 'Monthly/Total Value (SAR)',
    valuePh: '0.00',
    scope: 'Scope / what this covers',
    scopePh: 'e.g. Monthly social media management on Instagram + TikTok. 12 posts/month, 4 reels, 8 stories. Engagement responses Sun–Thu.',
    deliverables: 'Deliverables / plan',
    addItem: 'Add item',
    emptyHint: "Optional. Itemize the concrete things you'll deliver — e.g. \"Brand mood board\", \"12 IG posts/month\", \"Quarterly strategy review\".",
    deliverableTitlePh: 'Deliverable title (e.g. 12 IG posts/month)',
    deliverableDetailPh: 'Detail / spec (optional)',
    cancel: 'Cancel',
    save: 'Save Contract',
    saving: 'Saving…',
  },
  ar: {
    newContract: 'عقد جديد',
    title: 'إنشاء عقد',
    contractTitle: 'عنوان العقد',
    contractTitlePh: 'مثال: إدارة سوشيال ميديا ٢٠٢٤',
    client: 'العميل',
    selectClient: 'اختر العميل',
    typeLabel: 'النوع',
    retainer: 'اشتراك شهري',
    project: 'مشروع',
    oneTime: 'لمرة واحدة',
    startDate: 'تاريخ البداية',
    endDate: 'تاريخ النهاية',
    value: 'القيمة الشهرية / الإجمالية (ر.س)',
    valuePh: '0.00',
    scope: 'نطاق العمل / ما يغطيه',
    scopePh: 'مثال: إدارة سوشيال ميديا شهرية على إنستجرام + تيك توك. ١٢ منشور/الشهر، ٤ ريلز، ٨ ستوريز.',
    deliverables: 'المخرجات / الخطة',
    addItem: 'إضافة بند',
    emptyHint: 'اختياري. أدرج الأشياء المحددة التي ستسلمها — مثال: "هوية بصرية"، "١٢ منشور إنستجرام/الشهر"، "مراجعة استراتيجية ربع سنوية".',
    deliverableTitlePh: 'عنوان البند (مثال: ١٢ منشور إنستجرام/الشهر)',
    deliverableDetailPh: 'تفاصيل / مواصفات (اختياري)',
    cancel: 'إلغاء',
    save: 'حفظ العقد',
    saving: 'جاري الحفظ…',
  },
} as const

type Deliverable = { id: string; title: string; detail: string }

const uid = () => Math.random().toString(36).slice(2, 9)

export function AddContractModal({ clients }: { clients: any[] }) {
  const { language, dir } = useLanguage()
  const T = STRINGS[language === 'ar' ? 'ar' : 'en']
  const [isOpen, setIsOpen] = useState(false)
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [submitting, setSubmitting] = useState(false)

  function addRow() {
    setDeliverables((d) => [...d, { id: uid(), title: "", detail: "" }])
  }
  function updateRow(id: string, patch: Partial<Deliverable>) {
    setDeliverables((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function removeRow(id: string) {
    setDeliverables((d) => d.filter((r) => r.id !== id))
  }
  function close() {
    setIsOpen(false)
    setDeliverables([])
  }

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="mr-2 h-4 w-4" /> {T.newContract}
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" dir={dir}>
      <div className="bg-white text-gray-900 w-full max-w-xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" /> {T.title}
          </h2>
          <button onClick={close} className="text-gray-400 hover:text-gray-700" disabled={submitting}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          action={async (formData) => {
            setSubmitting(true)
            // Drop blank deliverable rows so we don't persist empty entries.
            const clean = deliverables
              .filter((d) => d.title.trim())
              .map((d) => ({
                id: d.id,
                title: d.title.trim(),
                detail: d.detail.trim() || undefined,
                status: 'pending' as const,
              }))
            formData.set('deliverables', JSON.stringify(clean))
            try {
              await createContract(formData)
              close()
            } finally {
              setSubmitting(false)
            }
          }}
          className="p-6 space-y-4 overflow-y-auto"
        >
          <div className="space-y-2">
            <label className="text-sm font-semibold">{T.contractTitle}</label>
            <input name="title" required className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900" placeholder={T.contractTitlePh} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                <Building className="h-3 w-3" /> {T.client}
              </label>
              <select name="client_id" required className="w-full p-2.5 border rounded-xl bg-gray-50/50 text-gray-900 appearance-none text-sm">
                <option value="">{T.selectClient}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">{T.typeLabel}</label>
              <select name="contract_type" className="w-full p-2.5 border rounded-xl bg-gray-50/50 text-gray-900 appearance-none text-sm">
                <option value="Retainer">{T.retainer}</option>
                <option value="Project">{T.project}</option>
                <option value="One-time">{T.oneTime}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-3 w-3" /> {T.startDate}
              </label>
              <input name="start_date" type="date" required className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900 text-sm" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-3 w-3" /> {T.endDate}
              </label>
              <input name="end_date" type="date" className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900 text-sm" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="h-3 w-3" /> {T.value}
            </label>
            <input name="value" type="number" step="0.01" className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900" placeholder={T.valuePh} />
          </div>

          {/* Scope — plain-language description of what this engagement covers */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">{T.scope}</label>
            <textarea
              name="scope"
              rows={3}
              placeholder={T.scopePh}
              className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900 text-sm resize-none"
            />
          </div>

          {/* Deliverables — itemized checklist of concrete things the agency owes the client */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" /> {T.deliverables}
              </label>
              <button
                type="button"
                onClick={addRow}
                className="text-xs font-semibold px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> {T.addItem}
              </button>
            </div>
            {deliverables.length === 0 ? (
              <p className="text-xs text-gray-500 italic px-3 py-3 rounded-lg bg-gray-50 border border-dashed border-gray-200">
                {T.emptyHint}
              </p>
            ) : (
              <div className="space-y-2">
                {deliverables.map((d, i) => (
                  <div key={d.id} className="flex gap-2 items-start p-2 rounded-lg border border-gray-200 bg-gray-50">
                    <span className="text-[10px] font-bold text-gray-400 w-5 pt-2.5 text-center">{i + 1}</span>
                    <div className="flex-1 space-y-1.5">
                      <input
                        value={d.title}
                        onChange={(e) => updateRow(d.id, { title: e.target.value })}
                        placeholder={T.deliverableTitlePh}
                        className="w-full p-2 border rounded-lg bg-white text-gray-900 text-sm"
                      />
                      <input
                        value={d.detail}
                        onChange={(e) => updateRow(d.id, { detail: e.target.value })}
                        placeholder={T.deliverableDetailPh}
                        className="w-full p-2 border rounded-lg bg-white text-gray-900 text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(d.id)}
                      className="text-gray-400 hover:text-red-500 p-1.5"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={close} disabled={submitting}>{T.cancel}</Button>
            <Button type="submit" className="flex-1 bg-primary text-white" disabled={submitting}>
              {submitting ? T.saving : T.save}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
