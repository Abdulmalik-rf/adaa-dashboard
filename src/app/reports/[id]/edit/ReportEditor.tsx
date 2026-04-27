'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import {
  saveReportHeader,
  addReportService,
  updateReportService,
  removeReportService,
  moveReportService,
  uploadReportImage,
  deleteReport,
} from '@/app/actions/reports'
import {
  ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, Save, Upload, ImageOff,
  Eye,
} from 'lucide-react'

type ServiceMetric = { label: string; value: string }
type ServiceItem = { title: string; detail: string | null }
type ServiceImage = { url: string; caption: string | null }
type ServiceBlock = {
  id: string
  kind: string
  title: string
  icon: string
  body: string | null
  metrics: ServiceMetric[]
  items: ServiceItem[]
  images: ServiceImage[]
}

const SERVICE_PRESETS: Array<{ kind: string; title: string; icon: string }> = [
  { kind: 'seo',        title: 'SEO',                  icon: '🔍' },
  { kind: 'cold_mail',  title: 'Cold Mailing',         icon: '✉️' },
  { kind: 'social',     title: 'Social Media',         icon: '📱' },
  { kind: 'paid_promo', title: 'Paid Promotions',      icon: '🎯' },
  { kind: 'content',    title: 'Content Production',   icon: '🎬' },
  { kind: 'branding',   title: 'Branding & Design',    icon: '🎨' },
  { kind: 'web',        title: 'Website / Landing',    icon: '🌐' },
  { kind: 'custom',     title: 'Custom service',       icon: '⭐' },
]

export default function ReportEditor({ report }: { report: any }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const services: ServiceBlock[] = Array.isArray(report.services) ? report.services : []

  return (
    <div className="space-y-5 pb-12">
      {/* ===== Toolbar ====================================================== */}
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href={`/reports/${report.id}`}
            className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to view
          </Link>
          <span className="text-[hsl(var(--muted-foreground))]">·</span>
          <h1 className="text-xl font-bold">{report.report_number}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/reports/${report.id}`}
            className="px-3 py-1.5 rounded-md border border-[hsl(var(--border))] text-sm flex items-center gap-2 hover:bg-[hsl(var(--muted)/0.4)]"
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </Link>
          <button
            onClick={() => {
              if (!confirm(`Delete ${report.report_number}? This cannot be undone.`)) return
              startTransition(async () => {
                await deleteReport(report.id)
                router.push('/reports')
              })
            }}
            disabled={isPending}
            className="px-3 py-1.5 rounded-md border border-red-200 text-sm text-red-600 flex items-center gap-2 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete report
          </button>
        </div>
      </div>

      {/* ===== Header form ================================================== */}
      <Card title="Cover">
        <form
          action={async (fd: FormData) => {
            await saveReportHeader(report.id, fd)
            router.refresh()
          }}
          className="grid gap-4"
        >
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Customer name" name="customer_name" defaultValue={report.customer_name ?? report.client_name_snapshot ?? ''} />
            <Field label="Company" name="customer_company" defaultValue={report.customer_company ?? ''} />
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Period start" name="period_start" type="date" defaultValue={report.period_start ?? ''} />
            <Field label="Period end" name="period_end" type="date" defaultValue={report.period_end ?? ''} />
            <Field label="Issue date" name="issue_date" type="date" defaultValue={report.issue_date ?? ''} />
          </div>
          <CoverImageField defaultValue={report.cover_image_url ?? ''} />
          <Textarea
            label="Executive summary"
            name="summary"
            placeholder="One short paragraph summarizing the week."
            defaultValue={report.summary ?? ''}
          />
          <Textarea
            label="Notes & recommendations (optional, prints at the bottom)"
            name="notes"
            placeholder="Anything to flag, propose, or follow up on."
            defaultValue={report.notes ?? ''}
          />
          <div className="grid md:grid-cols-2 gap-4">
            <Select
              label="Status"
              name="status"
              defaultValue={report.status ?? 'draft'}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <div className="flex items-end justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> Save cover
              </button>
            </div>
          </div>
        </form>
      </Card>

      {/* ===== Existing service blocks ====================================== */}
      {services.map((svc, idx) => (
        <ServiceCard
          key={svc.id}
          report={report}
          svc={svc}
          isFirst={idx === 0}
          isLast={idx === services.length - 1}
        />
      ))}

      {/* ===== Add new service =============================================== */}
      <Card title="Add a service">
        <div className="flex flex-wrap gap-2">
          {SERVICE_PRESETS.map((preset) => (
            <form
              key={preset.kind}
              action={async (fd: FormData) => {
                await addReportService(report.id, fd)
                router.refresh()
              }}
            >
              <input type="hidden" name="kind" value={preset.kind} />
              <input type="hidden" name="title" value={preset.title} />
              <input type="hidden" name="icon" value={preset.icon} />
              <button
                type="submit"
                disabled={isPending}
                className="px-3 py-2 rounded-md border border-[hsl(var(--border))] text-sm flex items-center gap-2 hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] disabled:opacity-50"
              >
                <span className="text-base">{preset.icon}</span>
                <span>{preset.title}</span>
                <Plus className="h-3.5 w-3.5 ml-1 opacity-60" />
              </button>
            </form>
          ))}
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-3">
          Tip: pick &quot;Custom service&quot; to add anything not in the list. Title and icon stay editable after.
        </p>
      </Card>
    </div>
  )
}

// ============================================================================
// Service block editor
// ============================================================================

function ServiceCard({
  report,
  svc,
  isFirst,
  isLast,
}: {
  report: any
  svc: ServiceBlock
  isFirst: boolean
  isLast: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [metrics, setMetrics] = useState<ServiceMetric[]>(svc.metrics ?? [])
  const [items, setItems] = useState<ServiceItem[]>(svc.items ?? [])
  const [images, setImages] = useState<ServiceImage[]>(svc.images ?? [])

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <span className="text-lg">{svc.icon}</span>
          <span>{svc.title}</span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.4)] px-1.5 py-0.5 rounded">
            {svc.kind}
          </span>
        </div>
      }
      actions={
        <div className="flex gap-1">
          <IconButton
            title="Move up"
            disabled={isFirst || isPending}
            onClick={() =>
              startTransition(async () => {
                await moveReportService(report.id, svc.id, 'up')
                router.refresh()
              })
            }
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            title="Move down"
            disabled={isLast || isPending}
            onClick={() =>
              startTransition(async () => {
                await moveReportService(report.id, svc.id, 'down')
                router.refresh()
              })
            }
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            title="Remove"
            danger
            disabled={isPending}
            onClick={() => {
              if (!confirm(`Remove "${svc.title}" block?`)) return
              startTransition(async () => {
                await removeReportService(report.id, svc.id)
                router.refresh()
              })
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      }
    >
      <form
        action={async (fd: FormData) => {
          await updateReportService(report.id, svc.id, fd)
          router.refresh()
        }}
        className="grid gap-4"
      >
        <div className="grid md:grid-cols-[1fr_120px] gap-3">
          <Field label="Title" name="title" defaultValue={svc.title} />
          <Field
            label="Icon"
            name="icon"
            defaultValue={svc.icon}
            help="Any emoji"
          />
        </div>

        <Textarea
          label="What we did this week"
          name="body"
          rows={4}
          placeholder={`Describe the work delivered for ${svc.title} this week — what shipped, what improved, what's next.`}
          defaultValue={svc.body ?? ''}
        />

        {/* ----- Metrics --------------------------------------------------- */}
        <RepeatableList
          title="Metrics (optional, shown as cards)"
          rows={metrics}
          onChange={setMetrics}
          fields={[
            { name: 'label', placeholder: 'Metric label, e.g. "Keywords ranked"' },
            { name: 'value', placeholder: 'Value, e.g. "12 (+3)"' },
          ]}
          prefix="metrics"
          addLabel="Add metric"
        />

        {/* ----- Items ----------------------------------------------------- */}
        <RepeatableList
          title="Items / line entries (optional, shown as a bulleted list)"
          rows={items}
          onChange={setItems}
          fields={[
            { name: 'title', placeholder: 'Title, e.g. "5 reels published"' },
            { name: 'detail', placeholder: 'Detail (optional)', textarea: true },
          ]}
          prefix="items"
          addLabel="Add item"
        />

        {/* ----- Images ---------------------------------------------------- */}
        <ImageList rows={images} onChange={setImages} />

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Save {svc.title}
          </button>
        </div>
      </form>
    </Card>
  )
}

// ============================================================================
// Cover image upload (separate from service images — sits on the report header)
// ============================================================================

function CoverImageField({ defaultValue }: { defaultValue: string }) {
  const [url, setUrl] = useState(defaultValue)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onPick(file: File | null) {
    if (!file) return
    setBusy(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadReportImage(fd)
    setBusy(false)
    if (res.url) setUrl(res.url)
    else alert(res.error ?? 'upload failed')
  }

  return (
    <div className="grid gap-2">
      <label className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        Cover image (optional, shown next to the customer name)
      </label>
      <input type="hidden" name="cover_image_url" value={url} />
      <div className="flex gap-3 items-center">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="w-32 h-20 object-cover rounded-md border border-[hsl(var(--border))]" />
        ) : (
          <div className="w-32 h-20 bg-[hsl(var(--muted)/0.3)] rounded-md flex items-center justify-center text-[hsl(var(--muted-foreground))]">
            <ImageOff className="h-5 w-5" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 rounded-md border border-[hsl(var(--border))] text-xs flex items-center gap-1.5 hover:border-[hsl(var(--primary))] disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" /> {busy ? 'Uploading…' : url ? 'Replace' : 'Upload'}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => setUrl('')}
              className="text-xs text-red-600 underline"
            >
              Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Reusable bits
// ============================================================================

function Card({
  title,
  children,
  actions,
}: {
  title: React.ReactNode
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      <div className="px-5 py-3 border-b border-[hsl(var(--border))] flex justify-between items-center bg-[hsl(var(--muted)/0.2)]">
        <div className="font-bold text-sm">{title}</div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({
  label, name, type = 'text', defaultValue = '', help, placeholder,
}: {
  label: string; name: string; type?: string;
  defaultValue?: string; help?: string; placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        {label}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-9 rounded-md border border-[hsl(var(--border))] px-3 text-sm bg-[hsl(var(--background))]"
      />
      {help && <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{help}</span>}
    </div>
  )
}

function Textarea({
  label, name, defaultValue = '', placeholder, rows = 3,
}: {
  label: string; name: string; defaultValue?: string; placeholder?: string; rows?: number;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        {label}
      </label>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm bg-[hsl(var(--background))] leading-relaxed"
      />
    </div>
  )
}

function Select({
  label, name, options, defaultValue,
}: {
  label: string; name: string; defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        {label}
      </label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-9 rounded-md border border-[hsl(var(--border))] px-3 text-sm bg-[hsl(var(--background))]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function IconButton({
  children, onClick, disabled, title, danger,
}: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
  title: string; danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`h-7 w-7 rounded-md border border-[hsl(var(--border))] flex items-center justify-center disabled:opacity-30 ${
        danger
          ? 'text-red-500 hover:bg-red-50 hover:border-red-200'
          : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.4)]'
      }`}
    >
      {children}
    </button>
  )
}

function RepeatableList<T extends Record<string, any>>({
  title, rows, onChange, fields, prefix, addLabel,
}: {
  title: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  fields: Array<{ name: string; placeholder: string; textarea?: boolean }>;
  prefix: string;
  addLabel: string;
}) {
  function update(idx: number, field: string, value: string) {
    const copy = [...rows] as any[]
    copy[idx] = { ...copy[idx], [field]: value }
    onChange(copy as T[])
  }
  function remove(idx: number) {
    onChange(rows.filter((_, i) => i !== idx))
  }
  function add() {
    const blank = Object.fromEntries(fields.map((f) => [f.name, ''])) as T
    onChange([...rows, blank])
  }
  return (
    <div className="grid gap-2">
      <div className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        {title}
      </div>
      {rows.length === 0 && (
        <div className="text-xs text-[hsl(var(--muted-foreground))] italic px-2 py-3 border border-dashed border-[hsl(var(--border))] rounded-md text-center">
          (none)
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
            {fields.map((f) => {
              const Tag = f.textarea ? 'textarea' : 'input'
              return (
                <Tag
                  key={f.name}
                  name={`${prefix}[${i}][${f.name}]`}
                  defaultValue={row[f.name] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e: any) => update(i, f.name, e.target.value)}
                  rows={f.textarea ? 2 : undefined}
                  className={`${f.textarea ? '' : 'h-9 '}rounded-md border border-[hsl(var(--border))] px-3 ${f.textarea ? 'py-2' : ''} text-sm bg-[hsl(var(--background))]`}
                />
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="h-9 w-9 rounded-md border border-[hsl(var(--border))] flex items-center justify-center text-red-500 hover:bg-red-50 hover:border-red-200 flex-shrink-0"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="self-start text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]"
      >
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </button>
    </div>
  )
}

function ImageList({
  rows, onChange,
}: {
  rows: ServiceImage[]; onChange: (rows: ServiceImage[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function onPick(file: File | null) {
    if (!file) return
    setBusy(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadReportImage(fd)
    setBusy(false)
    if (res.url) {
      onChange([...rows, { url: res.url, caption: null }])
    } else {
      alert(res.error ?? 'upload failed')
    }
  }
  function remove(idx: number) {
    onChange(rows.filter((_, i) => i !== idx))
  }
  function setCaption(idx: number, caption: string) {
    const copy = [...rows]
    copy[idx] = { ...copy[idx], caption }
    onChange(copy)
  }

  return (
    <div className="grid gap-2">
      <div className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        Images (optional, shown as a thumbnail grid)
      </div>
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {rows.map((img, i) => (
            <div key={i} className="relative rounded-md border border-[hsl(var(--border))] overflow-hidden bg-[hsl(var(--muted)/0.2)]">
              <input type="hidden" name={`images[${i}][url]`} value={img.url} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="w-full aspect-video object-cover" />
              <input
                name={`images[${i}][caption]`}
                defaultValue={img.caption ?? ''}
                placeholder="Caption (optional)"
                onChange={(e) => setCaption(i, e.target.value)}
                className="w-full text-xs p-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                title="Remove image"
                className="absolute top-1.5 right-1.5 h-7 w-7 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="self-start text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" /> {busy ? 'Uploading…' : 'Add image'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}
