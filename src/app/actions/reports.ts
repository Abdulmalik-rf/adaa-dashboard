'use server'

import { revalidatePath } from 'next/cache'
import { agentSupabase } from '@/lib/chat-agent/supabase'
import { randomUUID } from 'node:crypto'

// Reuse the chat-agent's service-role client. It's already set up to bypass
// RLS, which is what we need for storage uploads + cross-table writes.
const sb = () => agentSupabase()

const SERVICE_KIND_LABELS: Record<string, { title: string; icon: string }> = {
  seo: { title: 'SEO', icon: '🔍' },
  cold_mail: { title: 'Cold Mailing', icon: '✉️' },
  social: { title: 'Social Media', icon: '📱' },
  paid_promo: { title: 'Paid Promotions', icon: '🎯' },
  content: { title: 'Content Production', icon: '🎬' },
  branding: { title: 'Branding & Design', icon: '🎨' },
  web: { title: 'Website / Landing', icon: '🌐' },
  custom: { title: 'Service', icon: '⭐' },
}

function defaultsForKind(kind: string) {
  return SERVICE_KIND_LABELS[kind] ?? SERVICE_KIND_LABELS.custom
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = strOrNull(v)
  if (s === null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// Pull repeatable rows out of FormData using the convention
//   <prefix>[<idx>][<field>]
// so we can edit metric/item/image lists in a single form.
function collectRows(formData: FormData, prefix: string, fields: string[]) {
  const rows: Record<string, Record<string, string | null>> = {}
  for (const [key, val] of formData.entries()) {
    const m = key.match(new RegExp(`^${prefix}\\[(\\d+)\\]\\[([a-z_]+)\\]$`))
    if (!m) continue
    const idx = m[1]
    const f = m[2]
    if (!fields.includes(f)) continue
    rows[idx] ??= {}
    rows[idx][f] = strOrNull(val)
  }
  // Sort by numeric index, drop fully-empty rows.
  return Object.entries(rows)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, row]) => row)
    .filter((row) => fields.some((f) => row[f] !== null))
}

// =============================================================================
// CREATE
// =============================================================================

function isoYearWeek(d = new Date()) {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(
    ((target.getTime() - firstThursday.getTime()) / 86400000 - 3 +
      ((firstThursday.getUTCDay() + 6) % 7)) / 7
  )
  return { year: target.getUTCFullYear(), week }
}

function lastMondayISO(d = new Date()) {
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  const m = new Date(d)
  m.setDate(d.getDate() - diff)
  return m.toISOString().split('T')[0]
}

async function nextReportNumber() {
  const { year, week } = isoYearWeek()
  const prefix = `WR-${year}-W${String(week).padStart(2, '0')}`
  const { data } = await sb()
    .from('weekly_reports')
    .select('report_number')
    .like('report_number', `${prefix}%`)
    .order('report_number', { ascending: false })
    .limit(1)
  const last = (data as any)?.[0]?.report_number
  if (!last) return prefix
  const m = last.match(/-(\d+)$/)
  return m ? `${prefix}-${parseInt(m[1], 10) + 1}` : `${prefix}-2`
}

export async function createReport(formData: FormData) {
  const customer_name = strOrNull(formData.get('customer_name'))
  const customer_company = strOrNull(formData.get('customer_company'))
  const period_start = strOrNull(formData.get('period_start')) ?? lastMondayISO()
  const period_end = strOrNull(formData.get('period_end')) ?? new Date().toISOString().split('T')[0]
  const summary = strOrNull(formData.get('summary'))

  const report_number = await nextReportNumber()
  const row = {
    report_number,
    customer_name,
    customer_company,
    client_name_snapshot: customer_name,
    period_start,
    period_end,
    issue_date: new Date().toISOString().split('T')[0],
    summary,
    services: [],
  }
  const { data, error } = await sb().from('weekly_reports').insert(row).select().single()
  if (error) throw new Error(`create report failed: ${error.message}`)
  revalidatePath('/reports')
  return { id: (data as any).id, report_number: (data as any).report_number }
}

// =============================================================================
// HEADER (cover info + summary + notes + status)
// =============================================================================

export async function saveReportHeader(id: string, formData: FormData) {
  const patch = {
    customer_name: strOrNull(formData.get('customer_name')),
    customer_company: strOrNull(formData.get('customer_company')),
    period_start: strOrNull(formData.get('period_start')),
    period_end: strOrNull(formData.get('period_end')),
    issue_date: strOrNull(formData.get('issue_date')),
    summary: strOrNull(formData.get('summary')),
    notes: strOrNull(formData.get('notes')),
    status: strOrNull(formData.get('status')) ?? 'draft',
    cover_image_url: strOrNull(formData.get('cover_image_url')),
  }
  const { error } = await sb().from('weekly_reports').update(patch).eq('id', id)
  if (error) throw new Error(`save report failed: ${error.message}`)
  revalidatePath('/reports')
  revalidatePath(`/reports/${id}`)
  revalidatePath(`/reports/${id}/edit`)
}

// =============================================================================
// SERVICE BLOCKS (the agent + dashboard both edit through these)
// =============================================================================

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

async function fetchServices(id: string): Promise<ServiceBlock[]> {
  const { data, error } = await sb()
    .from('weekly_reports').select('services').eq('id', id).single()
  if (error) throw new Error(`fetch services failed: ${error.message}`)
  return Array.isArray((data as any).services) ? (data as any).services : []
}

async function writeServices(id: string, services: ServiceBlock[]) {
  const { error } = await sb()
    .from('weekly_reports').update({ services }).eq('id', id)
  if (error) throw new Error(`save services failed: ${error.message}`)
  revalidatePath(`/reports/${id}`)
  revalidatePath(`/reports/${id}/edit`)
}

export async function addReportService(id: string, formData: FormData) {
  const kind = strOrNull(formData.get('kind')) ?? 'custom'
  const defaults = defaultsForKind(kind)
  const block: ServiceBlock = {
    id: randomUUID(),
    kind,
    title: strOrNull(formData.get('title')) ?? defaults.title,
    icon: strOrNull(formData.get('icon')) ?? defaults.icon,
    body: strOrNull(formData.get('body')),
    metrics: collectRows(formData, 'metrics', ['label', 'value']) as ServiceMetric[],
    items: collectRows(formData, 'items', ['title', 'detail']) as ServiceItem[],
    images: collectRows(formData, 'images', ['url', 'caption']) as ServiceImage[],
  }
  const list = await fetchServices(id)
  list.push(block)
  await writeServices(id, list)
}

export async function updateReportService(
  id: string,
  serviceId: string,
  formData: FormData,
) {
  const list = await fetchServices(id)
  const idx = list.findIndex((s) => s.id === serviceId)
  if (idx < 0) throw new Error(`service ${serviceId} not found in report ${id}`)
  const old = list[idx]
  list[idx] = {
    ...old,
    title: strOrNull(formData.get('title')) ?? old.title,
    icon: strOrNull(formData.get('icon')) ?? old.icon,
    body: strOrNull(formData.get('body')),
    metrics: collectRows(formData, 'metrics', ['label', 'value']) as ServiceMetric[],
    items: collectRows(formData, 'items', ['title', 'detail']) as ServiceItem[],
    images: collectRows(formData, 'images', ['url', 'caption']) as ServiceImage[],
  }
  await writeServices(id, list)
}

export async function removeReportService(id: string, serviceId: string) {
  const list = await fetchServices(id)
  await writeServices(id, list.filter((s) => s.id !== serviceId))
}

export async function moveReportService(
  id: string,
  serviceId: string,
  direction: 'up' | 'down',
) {
  const list = await fetchServices(id)
  const idx = list.findIndex((s) => s.id === serviceId)
  if (idx < 0) return
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1
  if (targetIdx < 0 || targetIdx >= list.length) return
  ;[list[idx], list[targetIdx]] = [list[targetIdx], list[idx]]
  await writeServices(id, list)
}

// =============================================================================
// IMAGE UPLOAD (browser → server action → Supabase Storage → public URL)
// =============================================================================
// Returns the public URL the dashboard then drops into a hidden form field
// (image[N][url]) before the user saves.

export type UploadResult =
  | { url: string; error?: undefined }
  | { error: string; url?: undefined }

export async function uploadReportImage(formData: FormData): Promise<UploadResult> {
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { error: 'no file uploaded' }
  }
  if (file.size > 8 * 1024 * 1024) {
    return { error: 'image too large (>8 MB)' }
  }

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin'
  const slug = (file.name.replace(/\.[^.]+$/, '') || 'image')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image'
  const path = `${new Date().toISOString().split('T')[0]}/${slug}-${Date.now()}.${ext}`

  const bytes = Buffer.from(await file.arrayBuffer())
  const { error } = await sb().storage
    .from('report-images')
    .upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (error) return { error: error.message }

  const { data: pub } = sb().storage.from('report-images').getPublicUrl(path)
  return { url: pub.publicUrl }
}

// =============================================================================
// DELETE
// =============================================================================

export async function deleteReport(id: string) {
  const { error } = await sb().from('weekly_reports').delete().eq('id', id)
  if (error) throw new Error(`delete report failed: ${error.message}`)
  revalidatePath('/reports')
}
