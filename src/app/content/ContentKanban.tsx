"use client"

import { useState, useMemo } from "react"
import { Image as ImageIcon, Calendar, User as UserIcon, ArrowRight, Search, Check, X, Film, MessageSquare } from "lucide-react"
import { updateContentScheduleStatus } from "@/app/actions/content"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import { SubmitPostModal } from "./SubmitPostModal"

// approve/reject route via a stable HTTP endpoint so a stale browser
// bundle doesn't break the flow after a deploy. The server action IDs
// change on every build; /api/content-review/:id does not.
async function reviewContent(
  id: string,
  payload: { action: 'approve' | 'reject'; notes?: string },
) {
  const res = await fetch(`/api/content-review/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j?.error || `HTTP ${res.status}`)
  }
}

type Item = {
  id: string
  title: string
  caption?: string | null
  description?: string | null
  platform: string
  content_type: string
  publish_date: string
  publish_time?: string | null
  schedule_status: string
  client_id?: string | null
  assignee_id?: string | null
  media_url?: string | null
  submitted_at?: string | null
  submitted_by?: string | null
  review_notes?: string | null
}

const PLATFORM_ICON: Record<string, string> = {
  instagram: '📸', tiktok: '🎬', snapchat: '👻', google_ads: '🎯',
  facebook: '📘', twitter: '🐦', linkedin: '💼', youtube: '📺',
}

function isVideoUrl(url?: string | null) {
  if (!url) return false
  const lower = url.toLowerCase().split('?')[0]
  return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm')
}

export function ContentKanban({
  items: initialItems, clients, teamMembers, isAdmin,
}: {
  items: Item[]
  clients: { id: string; company_name: string }[]
  teamMembers: { id: string; full_name: string }[]
  isAdmin: boolean
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'

  // i18n for the columns lives here so labels flip with the toggle
  // instead of being baked into the constant.
  const columns: { key: string; label: string; color: string }[] = [
    { key: 'idea',      label: ar ? 'أفكار'     : 'Ideas',      color: 'bg-gray-400' },
    { key: 'pending',   label: ar ? 'بانتظار المراجعة' : 'Pending',    color: 'bg-amber-500' },
    { key: 'approved',  label: ar ? 'معتمد'      : 'Approved',   color: 'bg-blue-500' },
    { key: 'scheduled', label: ar ? 'مجدول'      : 'Scheduled',  color: 'bg-purple-500' },
    { key: 'published', label: ar ? 'منشور'      : 'Published',  color: 'bg-emerald-500' },
  ]

  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<{ id: string; title: string } | null>(null)

  const clientName = (id?: string | null) => clients.find((c) => c.id === id)?.company_name
  const assigneeName = (id?: string | null) => teamMembers.find((t) => t.id === id)?.full_name

  // Filter once, then group by column.
  const grouped = useMemo(() => {
    const filtered = items.filter((i) => {
      if (filterClient && i.client_id !== filterClient) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        i.title.toLowerCase().includes(q) ||
        (i.caption || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (clientName(i.client_id) || '').toLowerCase().includes(q)
      )
    })
    const out: Record<string, Item[]> = {}
    for (const c of columns) out[c.key] = []
    for (const it of filtered) {
      const k = columns.find((c) => c.key === it.schedule_status) ? it.schedule_status : 'idea'
      out[k].push(it)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, filterClient, clients, ar])

  async function moveTo(item: Item, newStatus: string) {
    if (newStatus === item.schedule_status) return
    setBusy(item.id)
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, schedule_status: newStatus } : i)),
    )
    try {
      await updateContentScheduleStatus(item.id, newStatus)
    } catch (err: any) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, schedule_status: item.schedule_status } : i)),
      )
      alert((ar ? 'فشل النقل: ' : 'Move failed: ') + (err?.message ?? 'unknown'))
    } finally {
      setBusy(null)
    }
  }

  async function approve(item: Item) {
    setBusy(item.id)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, schedule_status: 'approved' } : i)))
    try {
      await reviewContent(item.id, { action: 'approve' })
    } catch (err: any) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, schedule_status: 'pending' } : i)))
      alert((ar ? 'فشلت الموافقة: ' : 'Approve failed: ') + (err?.message ?? 'unknown'))
    } finally {
      setBusy(null)
    }
  }

  async function reject(item: Item, notes?: string) {
    setBusy(item.id)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, schedule_status: 'idea', review_notes: notes ?? i.review_notes } : i)))
    try {
      await reviewContent(item.id, { action: 'reject', notes })
    } catch (err: any) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, schedule_status: 'pending' } : i)))
      alert((ar ? 'فشل الرفض: ' : 'Reject failed: ') + (err?.message ?? 'unknown'))
    } finally {
      setBusy(null)
      setReviewing(null)
    }
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-[hsl(var(--primary))]" />
            {ar ? 'خط إنتاج المحتوى' : 'Content Pipeline'}
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            {ar
              ? 'لوحة افتتاحية للمنشورات والريلز والقصص — من الفكرة إلى النشر.'
              : 'Editorial board for posts, reels, stories — drag through the stages from idea to published.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))] pointer-events-none" />
            <input
              className="form-input h-9 pl-10 text-sm w-56"
              placeholder={ar ? 'بحث بالعنوان / الوصف…' : 'Search title / caption…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-input h-9 text-sm w-44"
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
          >
            <option value="">{ar ? 'جميع العملاء' : 'All clients'}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>
          <SubmitPostModal clients={clients} />
        </div>
      </div>

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((col) => {
          const list = grouped[col.key] || []
          return (
            <div key={col.key} className="kanban-column">
              <div className="flex items-center justify-between sticky top-0 bg-[hsl(var(--background))] z-10 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.color}`} />
                  <h3 className="font-bold text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                    {col.label}
                  </h3>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">({list.length})</span>
                </div>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto">
                {list.length === 0 && (
                  <div className="text-xs text-[hsl(var(--muted-foreground))] text-center py-8 opacity-50">
                    {ar ? 'فارغ' : 'Empty'}
                  </div>
                )}
                {list.map((item) => (
                  <Card
                    key={item.id}
                    item={item}
                    busy={busy === item.id}
                    clientName={clientName(item.client_id) || undefined}
                    assignee={assigneeName(item.assignee_id) || undefined}
                    onMove={(newStatus) => moveTo(item, newStatus)}
                    onApprove={isAdmin && col.key === 'pending' ? () => approve(item) : undefined}
                    onReject={isAdmin && col.key === 'pending' ? () => setReviewing({ id: item.id, title: item.title }) : undefined}
                    currentColIndex={columns.findIndex((c) => c.key === col.key)}
                    columns={columns}
                    ar={ar}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {reviewing && (
        <RejectDialog
          title={reviewing.title}
          ar={ar}
          onCancel={() => setReviewing(null)}
          onConfirm={(notes) => {
            const found = items.find((i) => i.id === reviewing.id)
            if (found) reject(found, notes)
          }}
        />
      )}
    </div>
  )
}

function Card({
  item, busy, clientName, assignee, onMove, onApprove, onReject, currentColIndex, columns, ar,
}: {
  item: Item
  busy: boolean
  clientName?: string
  assignee?: string
  onMove: (newStatus: string) => void
  onApprove?: () => void
  onReject?: () => void
  currentColIndex: number
  columns: { key: string; label: string; color: string }[]
  ar: boolean
}) {
  const nextCol = columns[currentColIndex + 1]
  const isVideo = isVideoUrl(item.media_url)
  return (
    <div className={`premium-card p-3 space-y-2 transition-opacity ${busy ? 'opacity-50' : ''}`}>
      {/* Media preview — only when there's actually a file. crossOrigin=
          "anonymous" makes the request a CORS one so it works in any
          embedder-policy regime. A click on an image opens the file in a
          new tab so the admin can see it full-resolution before deciding. */}
      {item.media_url && (
        <div className="rounded-lg overflow-hidden border border-[hsl(var(--border))] bg-black/5 dark:bg-black/30">
          {isVideo ? (
            <video
              src={item.media_url}
              controls
              preload="metadata"
              crossOrigin="anonymous"
              className="w-full max-h-56 object-contain bg-black"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <a href={item.media_url} target="_blank" rel="noopener noreferrer" title={ar ? 'فتح الصورة بالحجم الأصلي' : 'Open full size'}>
              <img
                src={item.media_url}
                alt={item.title}
                crossOrigin="anonymous"
                className="w-full max-h-56 object-contain bg-black/40 cursor-zoom-in"
                loading="lazy"
                onError={(e) => {
                  // If the image fails (e.g. signed URL expired, COEP issue
                  // on an old deploy), swap to a clickable file-link so the
                  // admin can still get to the asset.
                  const img = e.currentTarget
                  img.style.display = 'none'
                  const fallback = img.parentElement?.querySelector('.media-fallback') as HTMLElement
                  if (fallback) fallback.style.display = 'flex'
                }}
              />
              <div
                className="media-fallback hidden items-center justify-center gap-2 p-4 text-xs text-[hsl(var(--muted-foreground))]"
                style={{ display: 'none' }}
              >
                <ImageIcon className="h-4 w-4" />
                {ar ? 'تعذّر تحميل المعاينة — اضغط للفتح' : 'Preview failed to load — click to open'}
              </div>
            </a>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm leading-snug line-clamp-2">{item.title}</p>
        <span className="text-base flex-shrink-0">{PLATFORM_ICON[item.platform] || '📋'}</span>
      </div>

      {item.description && (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))] line-clamp-2 italic">
          {item.description}
        </p>
      )}
      {item.caption && (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))] line-clamp-2">{item.caption}</p>
      )}

      <div className="flex flex-wrap gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
        <span className="badge badge-secondary text-[9px]">{item.platform}</span>
        <span className="badge badge-secondary text-[9px]">{item.content_type}</span>
        {item.media_url && (
          <span className="badge badge-secondary text-[9px] flex items-center gap-0.5">
            {isVideo ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
            {ar ? 'وسائط' : 'media'}
          </span>
        )}
      </div>

      <div className="space-y-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">
        {clientName && <p className="truncate">📍 {clientName}</p>}
        {item.publish_date && (
          <p className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {item.publish_date}{item.publish_time ? ` · ${item.publish_time.slice(0, 5)}` : ''}
          </p>
        )}
        {assignee && (
          <p className="flex items-center gap-1">
            <UserIcon className="h-3 w-3" />
            {assignee}
          </p>
        )}
        {item.review_notes && item.schedule_status === 'idea' && (
          <p className="flex items-start gap-1 text-amber-700 dark:text-amber-400 mt-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded px-2 py-1 text-[10px]">
            <MessageSquare className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span>{ar ? 'ملاحظة المسؤول: ' : 'Admin note: '}{item.review_notes}</span>
          </p>
        )}
      </div>

      {/* Approve / Reject for admin on pending cards */}
      {(onApprove || onReject) && (
        <div className="flex gap-1.5 pt-1">
          {onApprove && (
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-emerald-500 text-white text-[11px] font-bold px-2 py-1.5 hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 disabled:opacity-50"
            >
              <Check className="h-3 w-3" /> {ar ? 'موافقة' : 'Approve'}
            </button>
          )}
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-md text-[11px] font-bold px-2 py-1.5 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 disabled:opacity-50"
            >
              <X className="h-3 w-3" /> {ar ? 'إعادة' : 'Send Back'}
            </button>
          )}
        </div>
      )}

      <div className="flex gap-1 pt-1">
        <select
          className="form-input h-6 !py-0 text-[10px] flex-1"
          value={item.schedule_status}
          onChange={(e) => onMove(e.target.value)}
          disabled={busy}
        >
          {columns.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        {nextCol && (
          <button
            type="button"
            onClick={() => onMove(nextCol.key)}
            disabled={busy}
            className="btn btn-ghost btn-xs !p-1"
            title={`${ar ? 'انقل إلى' : 'Move to'} ${nextCol.label}`}
          >
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

function RejectDialog({
  title, ar, onCancel, onConfirm,
}: {
  title: string
  ar: boolean
  onCancel: () => void
  onConfirm: (notes: string) => void
}) {
  const [notes, setNotes] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b dark:border-slate-700">
          <h3 className="font-bold text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-amber-500" />
            {ar ? 'إعادة المنشور للتعديل' : 'Send post back for edits'}
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold">{title}</span>
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder={ar ? 'اشرح ما الذي يحتاج إلى تعديل (اختياري)…' : 'Explain what needs to change (optional)…'}
            className="w-full p-2.5 border rounded-xl dark:bg-slate-700 bg-gray-50 dark:border-slate-600 text-sm resize-none"
            autoFocus
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-gray-200 dark:border-slate-600 px-3 py-2 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => onConfirm(notes)}
              className="flex-1 rounded-lg bg-red-500 text-white px-3 py-2 text-xs font-semibold hover:bg-red-600"
            >
              {ar ? 'إعادة المنشور' : 'Send Back'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
