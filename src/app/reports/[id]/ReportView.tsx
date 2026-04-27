'use client'

import Link from 'next/link'
import { Printer, Pencil, ArrowLeft } from 'lucide-react'

const AGENCY = {
  name: 'Adaa',
  tagline: 'Advertisement & Digital Solutions',
  phone: '+966 577 602 467',
  address: 'Saudi Arabia — Khobar',
  email: 'abdulmalikalrifaee@outlook.com',
}

function fmtDate(val: string | null | undefined) {
  if (!val) return '—'
  const d = new Date(String(val) + (typeof val === 'string' && val.length === 10 ? 'T00:00:00' : ''))
  return isNaN(d.getTime())
    ? String(val)
    : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function rangeLabel(start: any, end: any) {
  if (!start && !end) return '—'
  if (!end) return fmtDate(start)
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${start} – ${end}`
  const sameYear = s.getFullYear() === e.getFullYear()
  const sFmt = s.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
  const eFmt = e.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${sFmt} – ${eFmt}`
}

type ServiceBlock = {
  id: string
  kind: string
  title: string
  icon: string
  body: string | null
  metrics: { label: string; value: string }[]
  items: { title: string; detail: string | null }[]
  images: { url: string; caption: string | null }[]
}

export default function ReportView({ report }: { report: any }) {
  const services: ServiceBlock[] = Array.isArray(report.services) ? report.services : []
  const customerName = report.customer_name ?? report.client_name_snapshot ?? '—'

  return (
    <>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .r-sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
          .r-section { page-break-inside: avoid; }
        }
        @media screen {
          .r-bg { background: #f3f4f6; padding: 24px 0; min-height: 100vh; }
          .r-sheet { max-width: 800px; margin: 0 auto 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border-radius: 8px; overflow: hidden; background: #fff; }
        }
        .r-sheet { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1f2937; }
        .r-strip { display: flex; align-items: center; justify-content: space-between; padding: 22px 32px; background: #0a1628; color: #fff; }
        .r-strip::after { display: none; }
        .r-brand { display: flex; align-items: center; gap: 12px; }
        .r-brand-mark { width: 36px; height: 36px; border-radius: 8px; background: #c8a45e; color: #0a1628; display: flex; align-items: center; justify-content: center; font-family: 'Playfair Display', serif; font-weight: 700; font-size: 18px; }
        .r-brand-name { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
        .r-doc-title { font-family: 'Playfair Display', serif; font-size: 18px; font-weight: 600; color: #c8a45e; letter-spacing: 1px; text-transform: uppercase; }
        .r-doc-period { font-size: 11px; color: rgba(255,255,255,0.65); margin-top: 2px; letter-spacing: 0.5px; }
        .r-cover { padding: 28px 32px 8px; }
        .r-cover-row { display: flex; gap: 32px; flex-wrap: wrap; align-items: flex-start; }
        .r-cover-meta { flex: 1; min-width: 0; }
        .r-cover-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #9ca3af; font-weight: 600; }
        .r-cover-name { font-size: 22px; font-weight: 700; color: #0a1628; margin-top: 4px; line-height: 1.25; }
        .r-cover-company { font-size: 14px; color: #6b7280; margin-top: 2px; }
        .r-cover-period { font-size: 12px; color: #6b7280; margin-top: 6px; font-weight: 500; }
        .r-cover-image { width: 200px; max-width: 35%; aspect-ratio: 16 / 10; border-radius: 8px; background: #f3f4f6; object-fit: cover; }
        .r-summary { padding: 20px 32px 4px; }
        .r-summary p { font-size: 14px; color: #374151; line-height: 1.7; white-space: pre-wrap; }
        .r-rule { height: 1px; background: linear-gradient(90deg, transparent, #d1d5db, transparent); margin: 24px 32px; }
        .r-section { padding: 6px 32px 18px; }
        .r-section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .r-section-icon { font-size: 22px; line-height: 1; }
        .r-section-title { font-size: 17px; font-weight: 700; color: #0a1628; letter-spacing: 0.2px; }
        .r-section-body { font-size: 13.5px; color: #374151; line-height: 1.7; white-space: pre-wrap; margin-bottom: 14px; }
        .r-metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 14px; }
        .r-metric { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
        .r-metric-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; font-weight: 600; margin-bottom: 4px; }
        .r-metric-value { font-size: 16px; font-weight: 700; color: #0a1628; font-family: 'Playfair Display', serif; }
        .r-items { margin-bottom: 14px; padding-left: 0; list-style: none; }
        .r-items li { padding: 8px 0 8px 18px; border-bottom: 1px solid #f3f4f6; position: relative; font-size: 13px; color: #374151; line-height: 1.6; }
        .r-items li:last-child { border-bottom: none; }
        .r-items li::before { content: ''; position: absolute; left: 0; top: 16px; width: 6px; height: 6px; border-radius: 50%; background: #c8a45e; }
        .r-items strong { color: #0a1628; font-weight: 600; }
        .r-items .r-item-detail { display: block; font-size: 12px; color: #6b7280; margin-top: 2px; }
        .r-images { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; margin-bottom: 6px; }
        .r-image-card { border-radius: 6px; overflow: hidden; border: 1px solid #e5e7eb; background: #f9fafb; }
        .r-image-card img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; display: block; background: #f3f4f6; }
        .r-image-caption { padding: 6px 10px; font-size: 11px; color: #6b7280; line-height: 1.5; }
        .r-notes { padding: 6px 32px 18px; }
        .r-notes-box { background: #f9fafb; border: 1px solid #e5e7eb; border-left: 3px solid #c8a45e; border-radius: 6px; padding: 14px 18px; }
        .r-notes-box p { font-size: 13px; color: #374151; line-height: 1.7; white-space: pre-wrap; }
        .r-foot { padding: 16px 32px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
        .r-foot-line { font-size: 11px; color: #6b7280; }
        .r-foot-mark { font-size: 10px; letter-spacing: 1.5px; color: #9ca3af; text-transform: uppercase; }
        .r-empty { padding: 40px 32px; text-align: center; color: #9ca3af; font-size: 13px; }
      `}</style>

      <div className="no-print mb-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Link href="/reports" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> All reports
          </Link>
          <span className="text-[hsl(var(--muted-foreground))]">·</span>
          <div>
            <h1 className="text-xl font-bold">{report.report_number}</h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {customerName} · {rangeLabel(report.period_start, report.period_end)} · status: {report.status}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/reports/${report.id}/edit`}
            className="btn flex items-center gap-2 px-4 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.4)]"
          >
            <Pencil className="h-4 w-4" /> Edit
          </Link>
          <button
            onClick={() => window.print()}
            className="btn btn-primary flex items-center gap-2 px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-white"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
        </div>
      </div>

      <div className="r-bg">
        <div className="r-sheet">
          <div className="r-strip">
            <div className="r-brand">
              <div className="r-brand-mark">{AGENCY.name.charAt(0)}</div>
              <div>
                <div className="r-brand-name">{AGENCY.name}</div>
                <div className="r-doc-period">{AGENCY.tagline}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="r-doc-title">Weekly Report</div>
              <div className="r-doc-period">{report.report_number}</div>
            </div>
          </div>

          <div className="r-cover">
            <div className="r-cover-row">
              <div className="r-cover-meta">
                <div className="r-cover-label">Prepared for</div>
                <div className="r-cover-name">{customerName}</div>
                {report.customer_company && <div className="r-cover-company">{report.customer_company}</div>}
                <div className="r-cover-period">{rangeLabel(report.period_start, report.period_end)} · Issued {fmtDate(report.issue_date)}</div>
              </div>
              {report.cover_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={report.cover_image_url} alt="" className="r-cover-image" />
              )}
            </div>
          </div>

          {report.summary && (
            <div className="r-summary">
              <p>{report.summary}</p>
            </div>
          )}

          {services.length > 0 && <div className="r-rule" />}

          {services.length === 0 && !report.summary && (
            <div className="r-empty">
              No services added yet. Hit <strong>Edit</strong> to start filling this report in.
            </div>
          )}

          {services.map((svc) => (
            <div className="r-section" key={svc.id}>
              <div className="r-section-head">
                <div className="r-section-icon">{svc.icon || '⭐'}</div>
                <div className="r-section-title">{svc.title}</div>
              </div>

              {svc.body && <div className="r-section-body">{svc.body}</div>}

              {svc.metrics?.length > 0 && (
                <div className="r-metric-grid">
                  {svc.metrics.map((m, i) => (
                    <div className="r-metric" key={i}>
                      <div className="r-metric-label">{m.label}</div>
                      <div className="r-metric-value">{m.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {svc.items?.length > 0 && (
                <ul className="r-items">
                  {svc.items.map((it, i) => (
                    <li key={i}>
                      <strong>{it.title}</strong>
                      {it.detail && <span className="r-item-detail">{it.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}

              {svc.images?.length > 0 && (
                <div className="r-images">
                  {svc.images.map((img, i) => (
                    <div className="r-image-card" key={i}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.caption || ''} />
                      {img.caption && <div className="r-image-caption">{img.caption}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {report.notes && (
            <>
              <div className="r-rule" />
              <div className="r-notes">
                <div className="r-notes-box">
                  <p>{report.notes}</p>
                </div>
              </div>
            </>
          )}

          <div className="r-foot">
            <div className="r-foot-line">📍 {AGENCY.address} · 📞 {AGENCY.phone} · ✉ {AGENCY.email}</div>
            <div className="r-foot-mark">Adaa Agency</div>
          </div>
        </div>
      </div>
    </>
  )
}
