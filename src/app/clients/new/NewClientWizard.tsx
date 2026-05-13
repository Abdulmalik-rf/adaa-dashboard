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

const uid = () => Math.random().toString(36).slice(2, 9)

type Deliverable = { id: string; title: string; detail: string }
type KickoffTask = { id: string; title: string; due_date: string; priority: 'low' | 'medium' | 'high' | 'urgent' }
type KickoffReminder = { id: string; title: string; due_date: string; type: string; priority: 'low' | 'medium' | 'high' }

export function NewClientWizard() {
  const router = useRouter()
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

  // Step 1 → 2 guard.
  const basicsValid = basics.company_name.trim() && basics.full_name.trim()

  function go(next: 1 | 2 | 3) {
    setError(null)
    setStep(next)
  }

  async function submit() {
    setError(null)
    if (!basicsValid) { setError('Company name and primary contact are required.'); setStep(1); return }
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
    <div className="space-y-6 max-w-3xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-4 section-header mb-0 border-b-0 pb-0">
        <Link href="/clients" className="btn btn-ghost btn-icon">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add New Client</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">Three quick steps — basics, contract, and kickoff items.</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: 'Basics', icon: Building2 },
          { n: 2, label: 'Contract', icon: FileSignature },
          { n: 3, label: 'Kickoff', icon: ListChecks },
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
                <h3 className="font-bold text-sm border-b border-[hsl(var(--border))] pb-2">Company details</h3>

                <Field icon={Building2} label="Company name" required>
                  <input value={basics.company_name} onChange={(e) => setBasics({ ...basics, company_name: e.target.value })} className="form-input" placeholder="e.g. Acme Corp" />
                </Field>

                <Field icon={Briefcase} label="Industry">
                  <input value={basics.business_type} onChange={(e) => setBasics({ ...basics, business_type: e.target.value })} className="form-input" placeholder="e.g. Real Estate, E-commerce" />
                </Field>

                <Field label="Status">
                  <select value={basics.status} onChange={(e) => setBasics({ ...basics, status: e.target.value as any })} className="form-input">
                    <option value="to_contact">To contact</option>
                    <option value="lead">Lead (prospect)</option>
                    <option value="active">Active client</option>
                    <option value="paused">Paused</option>
                  </select>
                </Field>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-sm border-b border-[hsl(var(--border))] pb-2">Primary contact</h3>

                <Field icon={User} label="Contact name" required>
                  <input value={basics.full_name} onChange={(e) => setBasics({ ...basics, full_name: e.target.value })} className="form-input" placeholder="Full name" />
                </Field>

                <Field icon={Mail} label="Email">
                  <input type="email" value={basics.email} onChange={(e) => setBasics({ ...basics, email: e.target.value })} className="form-input" placeholder="contact@company.com" />
                </Field>

                <Field icon={Phone} label="Phone">
                  <input value={basics.phone} onChange={(e) => setBasics({ ...basics, phone: e.target.value })} className="form-input" placeholder="+966 5X XXX XXXX" />
                </Field>

                <Field icon={MapPin} label="City">
                  <input value={basics.city} onChange={(e) => setBasics({ ...basics, city: e.target.value })} className="form-input" placeholder="e.g. Riyadh" />
                </Field>
              </div>
            </div>

            <Field label="Initial notes (optional)">
              <textarea value={basics.notes} onChange={(e) => setBasics({ ...basics, notes: e.target.value })} rows={2} className="form-input resize-none" placeholder="Anything worth remembering up front…" />
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
                <p className="font-semibold text-sm">Attach an initial contract</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Skip if you're still in the lead/discovery phase — you can add one later.</p>
              </div>
            </label>

            {contractEnabled && (
              <div className="space-y-4">
                <Field label="Contract title" required>
                  <input value={contract.title} onChange={(e) => setContract({ ...contract, title: e.target.value })} className="form-input" placeholder="e.g. Social Media Management 2026" />
                </Field>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Type">
                    <select value={contract.contract_type} onChange={(e) => setContract({ ...contract, contract_type: e.target.value as any })} className="form-input">
                      <option value="Retainer">Retainer</option>
                      <option value="Project">Project</option>
                      <option value="One-time">One-time</option>
                    </select>
                  </Field>
                  <Field icon={Calendar} label="Start" required>
                    <input type="date" value={contract.start_date} onChange={(e) => setContract({ ...contract, start_date: e.target.value })} className="form-input" />
                  </Field>
                  <Field icon={Calendar} label="End">
                    <input type="date" value={contract.end_date} onChange={(e) => setContract({ ...contract, end_date: e.target.value })} className="form-input" />
                  </Field>
                </div>

                <Field icon={DollarSign} label="Monthly / total value (SAR)">
                  <input type="number" step="0.01" value={contract.value} onChange={(e) => setContract({ ...contract, value: e.target.value })} className="form-input" placeholder="0.00" />
                </Field>

                <Field label="Scope / what this covers">
                  <textarea value={contract.scope} onChange={(e) => setContract({ ...contract, scope: e.target.value })} rows={3} className="form-input resize-none" placeholder="Plain-language summary of what the engagement covers." />
                </Field>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="form-label flex items-center gap-2 mb-0">
                      <ListChecks className="h-4 w-4 text-[hsl(var(--primary))]" /> Deliverables
                    </label>
                    <button type="button" onClick={() => setDeliverables((d) => [...d, { id: uid(), title: '', detail: '' }])} className="text-xs font-semibold px-2 py-1 rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)] flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Add item
                    </button>
                  </div>
                  {deliverables.length === 0 ? (
                    <p className="text-xs text-[hsl(var(--muted-foreground))] italic px-3 py-3 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-dashed border-[hsl(var(--border))]">
                      Optional — itemize the concrete things you'll deliver.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {deliverables.map((d, i) => (
                        <div key={d.id} className="flex gap-2 items-start p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
                          <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] w-5 pt-2.5 text-center">{i + 1}</span>
                          <div className="flex-1 space-y-1.5">
                            <input value={d.title} onChange={(e) => setDeliverables((arr) => arr.map((r) => r.id === d.id ? { ...r, title: e.target.value } : r))} placeholder="Title (e.g. 12 IG posts/month)" className="form-input text-sm" />
                            <input value={d.detail} onChange={(e) => setDeliverables((arr) => arr.map((r) => r.id === d.id ? { ...r, detail: e.target.value } : r))} placeholder="Detail (optional)" className="form-input text-xs" />
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
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Optional — pre-seed the workspace with a couple of tasks and reminders so the team has something to act on day one.
            </p>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-[hsl(var(--primary))]" /> Initial tasks
                </h3>
                <button type="button" onClick={() => setTasks((t) => [...t, { id: uid(), title: '', due_date: '', priority: 'medium' }])} className="text-xs font-semibold px-2 py-1 rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)] flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add task
                </button>
              </div>
              {tasks.length === 0 ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))] italic px-3 py-3 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-dashed border-[hsl(var(--border))]">
                  No initial tasks — skip if not needed.
                </p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div key={t.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
                      <input value={t.title} onChange={(e) => setTasks((arr) => arr.map((r) => r.id === t.id ? { ...r, title: e.target.value } : r))} placeholder="Task title" className="form-input text-sm col-span-6" />
                      <input type="date" value={t.due_date} onChange={(e) => setTasks((arr) => arr.map((r) => r.id === t.id ? { ...r, due_date: e.target.value } : r))} className="form-input text-sm col-span-3" />
                      <select value={t.priority} onChange={(e) => setTasks((arr) => arr.map((r) => r.id === t.id ? { ...r, priority: e.target.value as any } : r))} className="form-input text-sm col-span-2">
                        <option value="low">low</option>
                        <option value="medium">med</option>
                        <option value="high">high</option>
                        <option value="urgent">urgent</option>
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
                  <Bell className="h-4 w-4 text-[hsl(var(--primary))]" /> Initial reminders
                </h3>
                <button type="button" onClick={() => setReminders((t) => [...t, { id: uid(), title: '', due_date: '', type: 'follow_up', priority: 'medium' }])} className="text-xs font-semibold px-2 py-1 rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)] flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add reminder
                </button>
              </div>
              {reminders.length === 0 ? (
                <p className="text-xs text-[hsl(var(--muted-foreground))] italic px-3 py-3 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-dashed border-[hsl(var(--border))]">
                  No initial reminders — skip if not needed.
                </p>
              ) : (
                <div className="space-y-2">
                  {reminders.map((r) => (
                    <div key={r.id} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
                      <input value={r.title} onChange={(e) => setReminders((arr) => arr.map((x) => x.id === r.id ? { ...x, title: e.target.value } : x))} placeholder="Reminder title (e.g. Send onboarding doc)" className="form-input text-sm col-span-5" />
                      <input type="date" value={r.due_date} onChange={(e) => setReminders((arr) => arr.map((x) => x.id === r.id ? { ...x, due_date: e.target.value } : x))} className="form-input text-sm col-span-3" />
                      <select value={r.type} onChange={(e) => setReminders((arr) => arr.map((x) => x.id === r.id ? { ...x, type: e.target.value } : x))} className="form-input text-sm col-span-2">
                        <option value="call">call</option>
                        <option value="meeting">meeting</option>
                        <option value="follow_up">follow up</option>
                        <option value="payment">payment</option>
                      </select>
                      <select value={r.priority} onChange={(e) => setReminders((arr) => arr.map((x) => x.id === r.id ? { ...x, priority: e.target.value as any } : x))} className="form-input text-sm col-span-1">
                        <option value="low">low</option>
                        <option value="medium">med</option>
                        <option value="high">high</option>
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
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <Link href="/clients" className="btn btn-secondary">Cancel</Link>
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={() => go((step + 1) as 1 | 2 | 3)}
              disabled={!basicsValid || submitting}
              className="btn btn-primary"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!basicsValid || submitting} className="btn btn-primary">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <>Create client</>}
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
