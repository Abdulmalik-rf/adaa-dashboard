'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Building2, User, Mail, Phone, MapPin, Briefcase,
  FileSignature, Calendar, DollarSign, ListChecks, Plus, Trash2,
  CheckSquare, Bell, ChevronRight, ChevronLeft, Loader2, Check,
} from 'lucide-react'
import { createClientWithKickoff, type NewClientWizardPayload } from '@/app/actions/clients'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const uid = () => Math.random().toString(36).slice(2, 9)

const STRINGS = {
  en: {
    pageTitle: 'Add New Client',
    pageSub: 'Three quick steps — basics, contract, and kickoff items.',
    stepBasics: 'Basics',
    stepContract: 'Contract',
    stepKickoff: 'Kickoff',
    companyDetails: 'Company details',
    primaryContact: 'Primary contact',
    companyName: 'Company name',
    industry: 'Industry',
    statusLabel: 'Status',
    contactName: 'Contact name',
    emailLabel: 'Email',
    phoneLabel: 'Phone',
    cityLabel: 'City',
    initialNotes: 'Initial notes (optional)',
    notesPlaceholder: "Anything worth remembering up front…",
    companyPh: 'e.g. Acme Corp',
    industryPh: 'e.g. Real Estate, E-commerce',
    contactPh: 'Full name',
    emailPh: 'contact@company.com',
    phonePh: '+966 5X XXX XXXX',
    cityPh: 'e.g. Riyadh',
    statusToContact: 'To contact',
    statusLead: 'Lead (prospect)',
    statusActive: 'Active client',
    statusPaused: 'Paused',
    attachContract: 'Attach an initial contract',
    attachContractHint: "Skip if you're still in the lead/discovery phase — you can add one later.",
    contractTitle: 'Contract title',
    contractTitlePh: 'e.g. Social Media Management 2026',
    typeLabel: 'Type',
    typeRetainer: 'Retainer',
    typeProject: 'Project',
    typeOneTime: 'One-time',
    start: 'Start',
    end: 'End',
    valueLabel: 'Monthly / total value (SAR)',
    valuePh: '0.00',
    scopeLabel: 'Scope / what this covers',
    scopePh: 'Plain-language summary of what the engagement covers.',
    deliverables: 'Deliverables',
    addItem: 'Add item',
    deliverableEmptyHint: "Optional — itemize the concrete things you'll deliver.",
    deliverableTitlePh: 'Title (e.g. 12 IG posts/month)',
    deliverableDetailPh: 'Detail (optional)',
    kickoffIntro: 'Optional — pre-seed the workspace with a couple of tasks and reminders so the team has something to act on day one.',
    initialTasks: 'Initial tasks',
    addTask: 'Add task',
    tasksEmpty: 'No initial tasks — skip if not needed.',
    taskTitlePh: 'Task title',
    initialReminders: 'Initial reminders',
    addReminder: 'Add reminder',
    remindersEmpty: 'No initial reminders — skip if not needed.',
    reminderTitlePh: 'Reminder title (e.g. Send onboarding doc)',
    priLow: 'low',
    priMed: 'med',
    priHigh: 'high',
    priUrgent: 'urgent',
    typeCall: 'call',
    typeMeeting: 'meeting',
    typeFollowUp: 'follow up',
    typePayment: 'payment',
    back: 'Back',
    cancel: 'Cancel',
    next: 'Next',
    createBtn: 'Create client',
    creating: 'Creating…',
    errMissing: 'Company name and primary contact are required.',
    weeklySchedule: 'Weekly reports schedule',
    weeklyScheduleIntro: 'Pre-create weekly report drafts and assign a responsible person. Each report will appear on the calendar at its due date and the assignee gets a notification.',
    enableSchedule: 'Auto-create weekly report drafts',
    assigneeLabel: 'Responsible person',
    pickAssignee: 'Select a team member…',
    weeksLabel: 'How many weeks',
    firstWeekStart: 'First week starts',
    noTeamHint: 'You need at least one team member before you can assign weekly reports. Add one from the Team page first.',
  },
  ar: {
    pageTitle: 'إضافة عميل جديد',
    pageSub: 'ثلاث خطوات سريعة — الأساسيات، العقد، وعناصر البداية.',
    stepBasics: 'الأساسيات',
    stepContract: 'العقد',
    stepKickoff: 'الانطلاق',
    companyDetails: 'بيانات الشركة',
    primaryContact: 'جهة الاتصال الرئيسية',
    companyName: 'اسم الشركة',
    industry: 'نشاط الشركة',
    statusLabel: 'الحالة',
    contactName: 'اسم المسؤول',
    emailLabel: 'البريد الإلكتروني',
    phoneLabel: 'الجوال',
    cityLabel: 'المدينة',
    initialNotes: 'ملاحظات أولية (اختياري)',
    notesPlaceholder: 'أي شيء يستحق التدوين من البداية…',
    companyPh: 'مثال: شركة آكمي',
    industryPh: 'مثال: عقارات، تجارة إلكترونية',
    contactPh: 'الاسم الكامل',
    emailPh: 'contact@company.com',
    phonePh: '+966 5X XXX XXXX',
    cityPh: 'مثال: الرياض',
    statusToContact: 'للتواصل',
    statusLead: 'محتمل',
    statusActive: 'عميل نشط',
    statusPaused: 'متوقف',
    attachContract: 'إرفاق عقد مبدئي',
    attachContractHint: 'تخطَّ إذا كنت لا تزال في مرحلة الاستكشاف — يمكنك إضافته لاحقاً.',
    contractTitle: 'عنوان العقد',
    contractTitlePh: 'مثال: إدارة سوشيال ميديا ٢٠٢٦',
    typeLabel: 'النوع',
    typeRetainer: 'اشتراك شهري',
    typeProject: 'مشروع',
    typeOneTime: 'لمرة واحدة',
    start: 'البداية',
    end: 'النهاية',
    valueLabel: 'القيمة الشهرية / الإجمالية (ر.س)',
    valuePh: '0.00',
    scopeLabel: 'نطاق العمل / ما يغطيه العقد',
    scopePh: 'وصف موجز بلغة بسيطة لما يشمله العقد.',
    deliverables: 'المخرجات',
    addItem: 'إضافة بند',
    deliverableEmptyHint: 'اختياري — أدرج الأشياء المحددة التي ستسلمها.',
    deliverableTitlePh: 'العنوان (مثال: ١٢ منشور إنستجرام/الشهر)',
    deliverableDetailPh: 'تفاصيل (اختياري)',
    kickoffIntro: 'اختياري — جهّز مساحة العمل ببعض المهام والتذكيرات حتى يبدأ الفريق العمل من اليوم الأول.',
    initialTasks: 'المهام الأولية',
    addTask: 'إضافة مهمة',
    tasksEmpty: 'لا توجد مهام أولية — تخطَّ إذا لم تكن مطلوبة.',
    taskTitlePh: 'عنوان المهمة',
    initialReminders: 'التذكيرات الأولية',
    addReminder: 'إضافة تذكير',
    remindersEmpty: 'لا توجد تذكيرات أولية — تخطَّ إذا لم تكن مطلوبة.',
    reminderTitlePh: 'عنوان التذكير (مثال: إرسال وثيقة الإعداد)',
    priLow: 'منخفضة',
    priMed: 'متوسطة',
    priHigh: 'مرتفعة',
    priUrgent: 'عاجلة',
    typeCall: 'مكالمة',
    typeMeeting: 'اجتماع',
    typeFollowUp: 'متابعة',
    typePayment: 'دفعة',
    back: 'السابق',
    cancel: 'إلغاء',
    next: 'التالي',
    createBtn: 'إنشاء العميل',
    creating: 'جاري الإنشاء…',
    errMissing: 'اسم الشركة وجهة الاتصال مطلوبان.',
    weeklySchedule: 'جدول التقارير الأسبوعية',
    weeklyScheduleIntro: 'أنشئ مسودات تقارير أسبوعية مسبقاً وعيّن مسؤولاً عنها. كل تقرير سيظهر في التقويم في تاريخ استحقاقه، والمسؤول سيتلقى إشعاراً.',
    enableSchedule: 'إنشاء مسودات تقارير أسبوعية تلقائياً',
    assigneeLabel: 'الشخص المسؤول',
    pickAssignee: 'اختر عضواً من الفريق…',
    weeksLabel: 'عدد الأسابيع',
    firstWeekStart: 'يبدأ الأسبوع الأول',
    noTeamHint: 'تحتاج إلى عضو واحد على الأقل في الفريق لتعيين التقارير الأسبوعية. أضف عضواً من صفحة الفريق أولاً.',
  },
} as const

type Deliverable = { id: string; title: string; detail: string }
type KickoffTask = { id: string; title: string; due_date: string; priority: 'low' | 'medium' | 'high' | 'urgent' }
type KickoffReminder = { id: string; title: string; due_date: string; type: string; priority: 'low' | 'medium' | 'high' }
type TeamMemberLite = { id: string; full_name: string; role?: string; job_title?: string }

// Find the upcoming Monday (or today, if today IS a Monday). Saudi
// workweek is Sun-Thu, but report periods anchored on Monday match how
// the existing `WR-YYYY-WNN` numbering already works (ISO week).
function nextMondayISO(): string {
  const d = new Date()
  const day = d.getDay() // 0 Sun .. 6 Sat
  const diff = (8 - day) % 7 || 7   // always at least 1 day forward
  // Actually if today IS a Monday, use today.
  const adj = day === 1 ? 0 : ((8 - day) % 7 || 0)
  d.setDate(d.getDate() + adj)
  return d.toISOString().slice(0, 10)
}

export function NewClientWizard({ teamMembers = [] }: { teamMembers?: TeamMemberLite[] }) {
  const router = useRouter()
  const { language, dir } = useLanguage()
  const T = STRINGS[language === 'ar' ? 'ar' : 'en']
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Step 1 — basics
  const [basics, setBasics] = useState({
    company_name: '',
    full_name: '',
    email: '',
    phone: '',
    whatsapp: '',
    city: '',
    business_type: '',
    status: 'lead' as 'to_contact' | 'lead' | 'active' | 'paused',
    notes: '',
  })

  // Step 2 — optional contract
  const [contractEnabled, setContractEnabled] = useState(false)
  const [contract, setContract] = useState({
    title: '',
    contract_type: 'Retainer' as 'Retainer' | 'Project' | 'One-time',
    start_date: '',
    end_date: '',
    value: '',
    scope: '',
  })
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])

  // Step 3 — kickoff
  const [tasks, setTasks] = useState<KickoffTask[]>([])
  const [reminders, setReminders] = useState<KickoffReminder[]>([])

  // Step 3 — weekly report schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleAssignee, setScheduleAssignee] = useState<string>('')
  const [scheduleWeeks, setScheduleWeeks] = useState<number>(12)
  const [scheduleStart, setScheduleStart] = useState<string>(nextMondayISO())

  // Step 1 → 2 guard.
  const basicsValid = basics.company_name.trim() && basics.full_name.trim()

  function go(next: 1 | 2 | 3) {
    setError(null)
    setStep(next)
  }

  async function submit() {
    setError(null)
    if (!basicsValid) { setError(T.errMissing); setStep(1); return }
    setSubmitting(true)
    try {
      const payload: NewClientWizardPayload = {
        basics: {
          company_name: basics.company_name.trim(),
          full_name: basics.full_name.trim(),
          email: basics.email.trim() || undefined,
          phone: basics.phone.trim() || undefined,
          whatsapp: basics.whatsapp.trim() || undefined,
          city: basics.city.trim() || undefined,
          business_type: basics.business_type.trim() || undefined,
          status: basics.status,
          notes: basics.notes.trim() || undefined,
        },
        contract: contractEnabled && contract.title.trim() && contract.start_date
          ? {
              title: contract.title.trim(),
              contract_type: contract.contract_type,
              start_date: contract.start_date,
              end_date: contract.end_date || undefined,
              value: contract.value ? parseFloat(contract.value) : undefined,
              scope: contract.scope.trim() || undefined,
              deliverables: deliverables
                .filter((d) => d.title.trim())
                .map((d) => ({ id: d.id, title: d.title.trim(), detail: d.detail.trim() || undefined, status: 'pending' as const })),
            }
          : undefined,
        tasks: tasks
          .filter((t) => t.title.trim())
          .map((t) => ({ title: t.title.trim(), due_date: t.due_date || undefined, priority: t.priority })),
        reminders: reminders
          .filter((r) => r.title.trim() && r.due_date)
          .map((r) => ({ title: r.title.trim(), due_date: r.due_date, type: r.type || 'follow_up', priority: r.priority })),
        report_schedule: scheduleEnabled && scheduleAssignee && scheduleWeeks > 0
          ? {
              assignee_team_member_id: scheduleAssignee,
              weeks: scheduleWeeks,
              start_date_iso: scheduleStart || nextMondayISO(),
            }
          : undefined,
      }

      const result = await createClientWithKickoff(payload)
      if (!result.ok) { setError(result.error); return }
      router.push(`/clients/${result.clientId}`)
    } catch (err: any) {
      setError(err?.message ?? 'Unexpected error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-8" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-4 section-header mb-0 border-b-0 pb-0">
        <Link href="/clients" className="btn btn-ghost btn-icon">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{T.pageTitle}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{T.pageSub}</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: T.stepBasics, icon: Building2 },
          { n: 2, label: T.stepContract, icon: FileSignature },
          { n: 3, label: T.stepKickoff, icon: ListChecks },
        ].map((s, i, arr) => {
          const active = step === s.n
          const done = step > s.n
          const Icon = s.icon
          return (
            <div key={s.n} className="flex items-center gap-2 flex-1">
              <button
                type="button"
                onClick={() => (s.n === 1 || basicsValid) && go(s.n as 1 | 2 | 3)}
                disabled={s.n > 1 && !basicsValid}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-[hsl(var(--primary))] text-white'
                    : done
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-[hsl(var(--muted)/0.4)] text-[hsl(var(--muted-foreground))]'
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                <span>{s.label}</span>
              </button>
              {i < arr.length - 1 && <div className="flex-1 h-px bg-[hsl(var(--border))]" />}
            </div>
          )
        })}
      </div>

      <div className="premium-card p-6">
        {/* STEP 1 — Basics */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-bold text-sm border-b border-[hsl(var(--border))] pb-2">{T.companyDetails}</h3>

                <Field icon={Building2} label={T.companyName} required>
                  <input value={basics.company_name} onChange={(e) => setBasics({ ...basics, company_name: e.target.value })} className="form-input" placeholder={T.companyPh} />
                </Field>

                <Field icon={Briefcase} label={T.industry}>
                  <input value={basics.business_type} onChange={(e) => setBasics({ ...basics, business_type: e.target.value })} className="form-input" placeholder={T.industryPh} />
                </Field>

                <Field label={T.statusLabel}>
                  <select value={basics.status} onChange={(e) => setBasics({ ...basics, status: e.target.value as any })} className="form-input">
                    <option value="to_contact">{T.statusToContact}</option>
                    <option value="lead">{T.statusLead}</option>
                    <option value="active">{T.statusActive}</option>
                    <option value="paused">{T.statusPaused}</option>
                  </select>
                </Field>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-sm border-b border-[hsl(var(--border))] pb-2">{T.primaryContact}</h3>

                <Field icon={User} label={T.contactName} required>
                  <input value={basics.full_name} onChange={(e) => setBasics({ ...basics, full_name: e.target.value })} className="form-input" placeholder={T.contactPh} />
                </Field>

                <Field icon={Mail} label={T.emailLabel}>
                  <input type="email" value={basics.email} onChange={(e) => setBasics({ ...basics, email: e.target.value })} className="form-input" placeholder={T.emailPh} />
                </Field>

                <Field icon={Phone} label={T.phoneLabel}>
                  <input value={basics.phone} onChange={(e) => setBasics({ ...basics, phone: e.target.value })} className="form-input" placeholder={T.phonePh} />
                </Field>

                <Field icon={MapPin} label={T.cityLabel}>
                  <input value={basics.city} onChange={(e) => setBasics({ ...basics, city: e.target.value })} className="form-input" placeholder={T.cityPh} />
                </Field>
              </div>
            </div>

            <Field label={T.initialNotes}>
              <textarea value={basics.notes} onChange={(e) => setBasics({ ...basics, notes: e.target.value })} rows={2} className="form-input resize-none" placeholder={T.notesPlaceholder} />
            </Field>
          </div>
        )}

        {/* STEP 2 — Contract */}
        {step === 2 && (
          <div className="space-y-6">
            <label className="flex items-center gap-3 p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] cursor-pointer">
              <input
                type="checkbox"
                checked={contractEnabled}
                onChange={(e) => setContractEnabled(e.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <div>
                <p className="font-semibold text-sm">{T.attachContract}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{T.attachContractHint}</p>
              </div>
            </label>

            {contractEnabled && (
              <div className="space-y-4">
                <Field label={T.contractTitle} required>
                  <input value={contract.title} onChange={(e) => setContract({ ...contract, title: e.target.value })} className="form-input" placeholder={T.contractTitlePh} />
                </Field>

                <div className="grid grid-cols-3 gap-3">
                  <Field label={T.typeLabel}>
                    <select value={contract.contract_type} onChange={(e) => setContract({ ...contract, contract_type: e.target.value as any })} className="form-input">
                      <option value="Retainer">{T.typeRetainer}</option>
                      <option value="Project">{T.typeProject}</option>
                      <option value="One-time">{T.typeOneTime}</option>
                    </select>
                  </Field>
                  <Field icon={Calendar} label={T.start} required>
                    <input type="date" value={contract.start_date} onChange={(e) => setContract({ ...contract, start_date: e.target.value })} className="form-input" />
                  </Field>
                  <Field icon={Calendar} label={T.end}>
                    <input type="date" value={contract.end_date} onChange={(e) => setContract({ ...contract, end_date: e.target.value })} className="form-input" />
                  </Field>
                </div>

                <Field icon={DollarSign} label={T.valueLabel}>
                  <input type="number" step="0.01" value={contract.value} onChange={(e) => setContract({ ...contract, value: e.target.value })} className="form-input" placeholder={T.valuePh} />
                </Field>

                <Field label={T.scopeLabel}>
                  <textarea value={contract.scope} onChange={(e) => setContract({ ...contract, scope: e.target.value })} rows={3} className="form-input resize-none" placeholder={T.scopePh} />
                </Field>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="form-label flex items-center gap-2 mb-0">
                      <ListChecks className="h-4 w-4 text-[hsl(var(--primary))]" /> {T.deliverables}
                    </label>
                    <button type="button" onClick={() => setDeliverables((d) => [...d, { id: uid(), title: '', detail: '' }])} className="text-xs font-semibold px-2 py-1 rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)] flex items-center gap-1">
                      <Plus className="h-3 w-3" /> {T.addItem}
                    </button>
                  </div>
                  {deliverables.length === 0 ? (
                    <p className="text-xs text-[hsl(var(--muted-foreground))] italic px-3 py-3 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-dashed border-[hsl(var(--border))]">
                      {T.deliverableEmptyHint}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {deliverables.map((d, i) => (
                        <div key={d.id} className="flex gap-2 items-start p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
                          <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] w-5 pt-2.5 text-center">{i + 1}</span>
                          <div className="flex-1 space-y-1.5">
                            <input value={d.title} onChange={(e) => setDeliverables((arr) => arr.map((r) => r.id === d.id ? { ...r, title: e.target.value } : r))} placeholder={T.deliverableTitlePh} className="form-input text-sm" />
                            <input value={d.detail} onChange={(e) => setDeliverables((arr) => arr.map((r) => r.id === d.id ? { ...r, detail: e.target.value } : r))} placeholder={T.deliverableDetailPh} className="form-input text-xs" />
                          </div>
                          <button type="button" onClick={() => setDeliverables((arr) => arr.filter((r) => r.id !== d.id))} className="text-[hsl(var(--muted-foreground))] hover:text-red-500 p-1.5">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — Kickoff items */}
        {step === 3 && (
          <div className="space-y-6">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{T.kickoffIntro}</p>

            {/* Weekly reports auto-schedule */}
            <div className="rounded-2xl border-2 border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.04)] p-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  disabled={teamMembers.length === 0}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))] disabled:opacity-50"
                />
                <div className="flex-1">
                  <p className="font-bold text-sm flex items-center gap-2">
                    <FileSignature className="h-4 w-4 text-[hsl(var(--primary))]" /> {T.weeklySchedule}
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{T.weeklyScheduleIntro}</p>
                </div>
              </label>
              {teamMembers.length === 0 ? (
                <p className="text-[11px] italic text-amber-700 dark:text-amber-400 rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-700/30 px-3 py-2">
                  {T.noTeamHint}
                </p>
              ) : (
                scheduleEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
                        {T.assigneeLabel}
                      </label>
                      <select
                        value={scheduleAssignee}
                        onChange={(e) => setScheduleAssignee(e.target.value)}
                        className="form-input text-sm w-full"
                      >
                        <option value="">{T.pickAssignee}</option>
                        {teamMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.full_name}{m.job_title ? ` — ${m.job_title}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
                        {T.weeksLabel}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={52}
                        value={scheduleWeeks}
                        onChange={(e) => setScheduleWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                        className="form-input text-sm w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
                        {T.firstWeekStart}
                      </label>
                      <input
                        type="date"
                        value={scheduleStart}
                        onChange={(e) => setScheduleStart(e.target.value)}
                        className="form-input text-sm w-full"
                      />
                    </div>
                  </div>
                )
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-[hsl(var(--primary))]" /> {T.initialTasks}
                </h3>
                <button type="button" onClick={() => setTasks((t) => [...t, { id: uid(), title: '', due_date: '', priority: 'medium' }])} className="text-xs font-semibold px-2 py-1 rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)] flex items-center gap-1">
                  <Plus className="h-3 w-3" /> {T.addTask}
                </button>
              </div>
              {tasks.length === 0 ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))] italic px-3 py-3 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-dashed border-[hsl(var(--border))]">
                  {T.tasksEmpty}
                </p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div key={t.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
                      <input value={t.title} onChange={(e) => setTasks((arr) => arr.map((r) => r.id === t.id ? { ...r, title: e.target.value } : r))} placeholder={T.taskTitlePh} className="form-input text-sm col-span-6" />
                      <input type="date" value={t.due_date} onChange={(e) => setTasks((arr) => arr.map((r) => r.id === t.id ? { ...r, due_date: e.target.value } : r))} className="form-input text-sm col-span-3" />
                      <select value={t.priority} onChange={(e) => setTasks((arr) => arr.map((r) => r.id === t.id ? { ...r, priority: e.target.value as any } : r))} className="form-input text-sm col-span-2">
                        <option value="low">{T.priLow}</option>
                        <option value="medium">{T.priMed}</option>
                        <option value="high">{T.priHigh}</option>
                        <option value="urgent">{T.priUrgent}</option>
                      </select>
                      <button type="button" onClick={() => setTasks((arr) => arr.filter((r) => r.id !== t.id))} className="text-[hsl(var(--muted-foreground))] hover:text-red-500 col-span-1 flex justify-center">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Bell className="h-4 w-4 text-[hsl(var(--primary))]" /> {T.initialReminders}
                </h3>
                <button type="button" onClick={() => setReminders((t) => [...t, { id: uid(), title: '', due_date: '', type: 'follow_up', priority: 'medium' }])} className="text-xs font-semibold px-2 py-1 rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)] flex items-center gap-1">
                  <Plus className="h-3 w-3" /> {T.addReminder}
                </button>
              </div>
              {reminders.length === 0 ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))] italic px-3 py-3 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-dashed border-[hsl(var(--border))]">
                  {T.remindersEmpty}
                </p>
              ) : (
                <div className="space-y-2">
                  {reminders.map((r) => (
                    <div key={r.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
                      <input value={r.title} onChange={(e) => setReminders((arr) => arr.map((x) => x.id === r.id ? { ...x, title: e.target.value } : x))} placeholder={T.reminderTitlePh} className="form-input text-sm col-span-5" />
                      <input type="date" value={r.due_date} onChange={(e) => setReminders((arr) => arr.map((x) => x.id === r.id ? { ...x, due_date: e.target.value } : x))} className="form-input text-sm col-span-3" />
                      <select value={r.type} onChange={(e) => setReminders((arr) => arr.map((x) => x.id === r.id ? { ...x, type: e.target.value } : x))} className="form-input text-sm col-span-2">
                        <option value="call">{T.typeCall}</option>
                        <option value="meeting">{T.typeMeeting}</option>
                        <option value="follow_up">{T.typeFollowUp}</option>
                        <option value="payment">{T.typePayment}</option>
                      </select>
                      <select value={r.priority} onChange={(e) => setReminders((arr) => arr.map((x) => x.id === r.id ? { ...x, priority: e.target.value as any } : x))} className="form-input text-sm col-span-1">
                        <option value="low">{T.priLow}</option>
                        <option value="medium">{T.priMed}</option>
                        <option value="high">{T.priHigh}</option>
                      </select>
                      <button type="button" onClick={() => setReminders((arr) => arr.filter((x) => x.id !== r.id))} className="text-[hsl(var(--muted-foreground))] hover:text-red-500 col-span-1 flex justify-center">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <div className="pt-6 mt-6 border-t border-[hsl(var(--border))] flex justify-between gap-3">
          {step > 1 ? (
            <button type="button" onClick={() => go((step - 1) as 1 | 2 | 3)} disabled={submitting} className="btn btn-secondary">
              <ChevronLeft className="h-4 w-4" /> {T.back}
            </button>
          ) : (
            <Link href="/clients" className="btn btn-secondary">{T.cancel}</Link>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={() => go((step + 1) as 1 | 2 | 3)}
              disabled={!basicsValid || submitting}
              className="btn btn-primary"
            >
              {T.next} <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!basicsValid || submitting} className="btn btn-primary">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> {T.creating}</> : <>{T.createBtn}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  icon: Icon,
  label,
  required,
  children,
}: {
  icon?: any
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="form-group">
      <label className="form-label flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />}
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
