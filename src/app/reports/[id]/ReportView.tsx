'use client'

import Link from 'next/link'
import { Printer, Pencil, ArrowLeft } from 'lucide-react'

// Weekly Report viewer — same Emergize editorial design system as the
// quotation page (Lilita One hero, Archivo Black headlines, lime/purple/black
// palette, decorative SVGs, dark footer with green stripe). Maps the
// services-array data model into the visual language: each service block
// gets a black bar header (mirroring the quotation table-bar) plus a
// metrics grid, items list, and image grid as appropriate.

const AGENCY = {
  name: 'Emergize',
  tagline: 'Emerge to Dominate',
  phone: '+966 577 602 467',
  address: 'Saudi Arabia — Khobar',
  email: 'abdulmalikalrifaee@outlook.com',
}

function fmtDate(val: string | null | undefined, long = false) {
  if (!val) return '—'
  const d = new Date(String(val) + (typeof val === 'string' && val.length === 10 ? 'T00:00:00' : ''))
  return isNaN(d.getTime())
    ? String(val)
    : d.toLocaleDateString('en-US', {
        day: 'numeric',
        month: long ? 'long' : 'short',
        year: 'numeric',
      })
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
    <div className="report-wrap">
      <div className="toolbar no-print">
        <Link href="/reports" className="back-link">
          <ArrowLeft className="h-3.5 w-3.5" /> All reports
        </Link>
        <span className="report-status" data-status={report.status}>{report.status}</span>
        <Link href={`/reports/${report.id}/edit`} className="edit-btn">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
        <button className="print-btn" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print / Save PDF
        </button>
      </div>

      <div className="report-page">
        {/* Decorative shapes */}
        <svg className="deco-blob" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <path
            fill="#9DCD3D"
            d="M44.4,-65.7C56.5,-58.2,64.5,-43.7,69.7,-28.7C74.9,-13.6,77.4,2,73.5,16.3C69.7,30.6,59.5,43.6,46.6,52.6C33.7,61.6,18.1,66.5,1.5,64.5C-15.2,62.5,-30.4,53.6,-43.5,43.4C-56.7,33.2,-67.7,21.8,-71.5,7.7C-75.3,-6.4,-72,-23.3,-63.1,-35.6C-54.3,-47.9,-39.8,-55.7,-25.6,-62.4C-11.4,-69.1,2.6,-74.7,16.6,-73.6C30.5,-72.5,32.4,-73.3,44.4,-65.7Z"
            transform="translate(100 100)"
          />
        </svg>
        <svg className="deco-asterisk" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L13.5 9.5L21 8L15 12L21 16L13.5 14.5L12 22L10.5 14.5L3 16L9 12L3 8L10.5 9.5L12 2Z" />
        </svg>
        <svg className="deco-arrow" viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M15 55 L55 15 M55 15 L25 15 M55 15 L55 45"
            stroke="#9DCD3D"
            strokeWidth="9"
            fill="none"
            strokeLinecap="square"
          />
        </svg>
        <div className="deco-checks">
          {Array.from({ length: 12 }, (_, i) => <div key={i} />)}
        </div>

        {/* Header */}
        <div className="r-header">
          <div className="r-header-content">
            <div className="r-brand-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="r-logo-img"
                src="/emergize-logo.png"
                alt="Emergize"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            </div>
            <div className="r-doc-meta">
              <div className="r-doc-meta-label">Reporting Period</div>
              <div className="r-doc-meta-value">{rangeLabel(report.period_start, report.period_end)}</div>
            </div>
          </div>
        </div>

        {/* Hero */}
        <div className="r-hero">
          <div className="r-hero-title">
            WE<span className="accent-green">E</span>KLY<br />REPOR<span className="accent-green">T</span>
            <span className="accent-green">!</span>
          </div>
          <div className="r-hero-sub">
            A SUMMARY OF THIS PERIOD&apos;S WORK PREPARED FOR YOU.
            METRICS, DELIVERABLES, AND WHAT&apos;S NEXT — ALL IN ONE PLACE.
          </div>
        </div>

        {/* Pills */}
        <div className="r-pills">
          <div className="pill pill-purple"><span className="dot"></span><span>{report.report_number}</span></div>
          <div className="pill pill-dark">Issued · {fmtDate(report.issue_date)}</div>
          <div className="pill pill-green">Period · {rangeLabel(report.period_start, report.period_end)}</div>
          {report.status && <div className="pill pill-white">Status&nbsp;<strong>{String(report.status).toUpperCase()}</strong></div>}
        </div>

        {/* Body */}
        <div className="r-body">
          <div className="r-body-inner">
            {/* Parties */}
            <div className="r-parties">
              <div className="r-party from">
                <div className="r-party-badge">Prepared by</div>
                <div className="r-party-name">{AGENCY.name}</div>
                <div className="r-party-detail">
                  📍 {AGENCY.address}<br />
                  📞 {AGENCY.phone}<br />
                  ✉ {AGENCY.email}
                </div>
              </div>
              <div className="r-party to">
                <div className="r-party-badge">Prepared for</div>
                <div className="r-party-name">{customerName}</div>
                {report.customer_company && <div className="r-client-company">{report.customer_company}</div>}
                <div className="r-party-detail">
                  Issued {fmtDate(report.issue_date, true)}
                </div>
              </div>
            </div>

            {/* Cover image (optional) */}
            {report.cover_image_url && (
              <div className="r-cover-banner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={report.cover_image_url} alt="" />
              </div>
            )}

            {/* Summary */}
            {report.summary && (
              <div className="r-summary-block">
                <div className="r-section-title">Summary</div>
                <div className="r-notes-box"><p>{report.summary}</p></div>
              </div>
            )}

            {/* Services */}
            {services.length === 0 && !report.summary && (
              <div className="r-empty">
                No services added yet. Hit <strong>Edit</strong> to start filling this report in.
              </div>
            )}

            {services.map((svc) => (
              <div className="r-service" key={svc.id}>
                <div className="r-service-bar">
                  <h3>
                    <span className="r-service-icon">{svc.icon || '⭐'}</span>
                    {svc.title}
                  </h3>
                  <span>{svc.kind?.toUpperCase()}</span>
                </div>

                <div className="r-service-body">
                  {svc.body && <p className="r-service-narrative">{svc.body}</p>}

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
                          <span className="r-item-num">{String(i + 1).padStart(2, '0')}</span>
                          <div>
                            <strong>{it.title}</strong>
                            {it.detail && <div className="r-item-detail">{it.detail}</div>}
                          </div>
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
              </div>
            ))}

            {/* Notes */}
            {report.notes && (
              <div className="r-notes-block">
                <div className="r-section-title">Notes</div>
                <div className="r-notes-box"><p>{report.notes}</p></div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="r-footer">
          <div className="r-footer-content">
            <div className="r-footer-info">
              <div className="r-footer-item">📍 {AGENCY.address}</div>
              <div className="r-footer-item">📞 {AGENCY.phone}</div>
              <div className="r-footer-item">✉ {AGENCY.email}</div>
            </div>
            <div className="r-footer-tag">Emerge · To · Dominate</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(body) { background: #0a0a0a; }
        .report-wrap {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px 16px 60px;
          gap: 16px;
        }
        .toolbar {
          width: 794px;
          max-width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          color: #e0e0e0;
        }
        .back-link {
          color: #9DCD3D;
          text-decoration: none;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
          margin-right: auto;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .back-link:hover { text-decoration: underline; }
        .report-status {
          font-family: 'Archivo Black', sans-serif;
          text-transform: uppercase;
          letter-spacing: 2px;
          font-size: 10px;
          padding: 5px 14px;
          border-radius: 50px;
          background: rgba(157, 205, 61, 0.15);
          color: #9DCD3D;
          border: 1px solid rgba(157, 205, 61, 0.3);
        }
        .report-status[data-status='sent'] { background: rgba(91, 75, 255, 0.18); color: #7A6CFF; border-color: rgba(91, 75, 255, 0.4); }
        .edit-btn, .print-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 50px;
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
        }
        .edit-btn {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #fff;
          padding: 9px 18px;
        }
        .edit-btn:hover { border-color: #9DCD3D; color: #9DCD3D; }
        .print-btn {
          background: #9DCD3D;
          color: #0a0a0a;
          border: none;
          padding: 11px 20px;
          box-shadow: 0 4px 15px rgba(157, 205, 61, 0.25);
        }
        .print-btn:hover {
          transform: translateY(-1px);
          background: #B5DC5C;
          box-shadow: 0 6px 20px rgba(157, 205, 61, 0.4);
        }

        /* ===== REPORT PAGE ===== */
        .report-page {
          width: 794px;
          max-width: 100%;
          min-height: 1123px;
          background: #ffffff;
          color: #0a0a0a;
          position: relative;
          overflow: hidden;
          box-shadow: 0 25px 80px rgba(0, 0, 0, 0.4);
          display: flex;
          flex-direction: column;
          font-family: 'Inter', system-ui, sans-serif;
        }

        /* Decorative SVGs */
        .deco-asterisk { position: absolute; top: 130px; left: 38px; width: 40px; height: 40px; color: #5B4BFF; pointer-events: none; z-index: 1; }
        .deco-arrow { position: absolute; top: 145px; right: 280px; width: 70px; height: 70px; pointer-events: none; z-index: 1; }
        .deco-blob { position: absolute; top: -50px; right: -50px; width: 240px; height: 240px; pointer-events: none; z-index: 0; opacity: 0.85; }
        .deco-checks {
          position: absolute;
          top: 480px;
          left: 30px;
          display: grid;
          grid-template-columns: repeat(4, 22px);
          grid-template-rows: repeat(3, 22px);
          gap: 4px;
          pointer-events: none;
          z-index: 0;
        }
        .deco-checks div { background: #5B4BFF; opacity: 0.9; }
        .deco-checks div:nth-child(2),
        .deco-checks div:nth-child(5),
        .deco-checks div:nth-child(7),
        .deco-checks div:nth-child(10) { background: transparent; }

        /* Header */
        .r-header { padding: 20px 50px 28px 30px; position: relative; z-index: 2; }
        .r-header-content { display: flex; justify-content: space-between; align-items: flex-start; }
        .r-logo-img { width: 340px; height: auto; max-height: 100px; object-fit: contain; display: block; }
        .r-doc-meta { text-align: right; }
        .r-doc-meta-label { font-size: 10px; color: #555; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; }
        .r-doc-meta-value { font-family: 'Archivo Black', sans-serif; font-size: 16px; color: #0a0a0a; letter-spacing: 0.5px; margin-top: 4px; line-height: 1.2; }

        /* Hero */
        .r-hero { padding: 18px 50px 26px; position: relative; z-index: 2; }
        .r-hero-title {
          font-family: 'Lilita One', 'Archivo Black', sans-serif;
          font-size: 88px;
          line-height: 0.9;
          color: #0a0a0a;
          letter-spacing: -1px;
          text-transform: uppercase;
          margin-bottom: 14px;
        }
        .r-hero-title .accent-green { color: #7BA82A; }
        .r-hero-sub {
          font-size: 13px;
          color: #555;
          letter-spacing: 1px;
          max-width: 480px;
          line-height: 1.5;
          font-weight: 500;
        }

        /* Pills */
        .r-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          padding: 0 50px 28px;
          position: relative;
          z-index: 2;
        }
        .pill {
          padding: 10px 22px;
          border-radius: 50px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .pill-purple { background: #5B4BFF; color: #fff; }
        .pill-dark { background: #0a0a0a; border: 1px solid #0a0a0a; color: #fff; }
        .pill-green { background: #9DCD3D; color: #0a0a0a; }
        .pill-white { background: #fff; color: #0a0a0a; border: 1.5px solid #0a0a0a; }
        .pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.5; }

        /* Body */
        .r-body { flex: 1; min-height: 0; position: relative; z-index: 2; }
        .r-body-inner { padding: 0 50px 30px; }

        /* Parties */
        .r-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 28px; }
        .r-party { padding: 22px 24px; border-radius: 16px; position: relative; border: 1.5px solid #e5e5e5; }
        .r-party.from { background: #f5f5f5; border-color: #0a0a0a; }
        .r-party.to { background: rgba(157, 205, 61, 0.12); border-color: #9DCD3D; }
        .r-party-badge {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 3px;
          text-transform: uppercase;
          padding: 5px 14px;
          border-radius: 50px;
          display: inline-block;
          margin-bottom: 10px;
        }
        .r-party.from .r-party-badge { background: #5B4BFF; color: #fff; }
        .r-party.to .r-party-badge { background: #9DCD3D; color: #0a0a0a; }
        .r-party-name { font-family: 'Archivo Black', sans-serif; font-size: 18px; color: #0a0a0a; margin: 4px 0 10px; letter-spacing: -0.3px; }
        .r-party-detail { font-size: 12px; color: #555; line-height: 1.8; }
        .r-client-company {
          display: inline-block;
          font-family: 'Archivo Black', sans-serif;
          font-size: 12px;
          color: #0a0a0a;
          background: #9DCD3D;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          padding: 5px 12px;
          border-radius: 50px;
          margin: 2px 0 8px;
        }

        /* Cover banner */
        .r-cover-banner { margin-bottom: 28px; border-radius: 16px; overflow: hidden; border: 1.5px solid #e5e5e5; aspect-ratio: 16/8; background: #f5f5f5; }
        .r-cover-banner :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }

        /* Section title */
        .r-section-title {
          font-family: 'Archivo Black', sans-serif;
          font-size: 14px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #0a0a0a;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .r-section-title::before { content: ''; width: 14px; height: 14px; background: #9DCD3D; border-radius: 50%; flex-shrink: 0; }
        .r-section-title::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, #e5e5e5, transparent); }

        .r-summary-block, .r-notes-block { margin-bottom: 28px; }

        /* Service blocks */
        .r-service { margin-bottom: 28px; page-break-inside: avoid; }
        .r-service-bar {
          background: #0a0a0a;
          padding: 14px 24px;
          border-radius: 12px 12px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .r-service-bar :global(h3) {
          font-family: 'Archivo Black', sans-serif;
          font-size: 13px;
          color: #9DCD3D;
          letter-spacing: 2px;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .r-service-bar :global(span) {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 700;
          letter-spacing: 1px;
        }
        .r-service-icon { font-size: 18px; line-height: 1; }
        .r-service-body {
          background: #fff;
          border: 1px solid #e5e5e5;
          border-top: none;
          border-radius: 0 0 12px 12px;
          padding: 22px 24px;
        }
        .r-service-narrative {
          font-size: 13.5px;
          color: #1a1a1a;
          line-height: 1.7;
          white-space: pre-wrap;
          margin-bottom: 18px;
        }

        /* Metrics */
        .r-metric-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
          margin-bottom: 18px;
        }
        .r-metric {
          background: rgba(157, 205, 61, 0.08);
          border: 1.5px solid rgba(157, 205, 61, 0.3);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .r-metric-label {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #555;
          margin-bottom: 6px;
        }
        .r-metric-value {
          font-family: 'Archivo Black', sans-serif;
          font-size: 22px;
          color: #0a0a0a;
          letter-spacing: -0.3px;
          line-height: 1.1;
        }

        /* Items list */
        .r-items {
          list-style: none;
          padding: 0;
          margin: 0 0 18px 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .r-items li {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          padding: 12px 14px;
          background: #f5f5f5;
          border: 1px solid #e5e5e5;
          border-radius: 10px;
        }
        .r-item-num {
          font-family: 'Archivo Black', sans-serif;
          font-size: 13px;
          color: #fff;
          background: #5B4BFF;
          min-width: 32px;
          height: 32px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .r-items li:nth-child(even) .r-item-num { background: #9DCD3D; color: #0a0a0a; }
        .r-items :global(strong) {
          font-family: 'Archivo Black', sans-serif;
          color: #0a0a0a;
          font-size: 13px;
          letter-spacing: -0.2px;
        }
        .r-item-detail { font-size: 11.5px; color: #555; line-height: 1.6; margin-top: 2px; }

        /* Images */
        .r-images {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px;
        }
        .r-image-card {
          border-radius: 12px;
          overflow: hidden;
          border: 1.5px solid #e5e5e5;
          background: #f5f5f5;
        }
        .r-image-card :global(img) {
          width: 100%;
          aspect-ratio: 16/10;
          object-fit: cover;
          display: block;
          background: #f5f5f5;
        }
        .r-image-caption {
          padding: 8px 12px;
          font-size: 11px;
          color: #555;
          line-height: 1.5;
        }

        /* Notes */
        .r-notes-box { background: #f5f5f5; border: 1.5px solid #e5e5e5; border-radius: 14px; padding: 16px 18px; }
        .r-notes-box :global(p) { font-size: 12.5px; color: #555; line-height: 1.7; white-space: pre-wrap; }

        .r-empty {
          padding: 40px 20px;
          text-align: center;
          color: #888;
          font-size: 13px;
          background: #f5f5f5;
          border-radius: 12px;
          border: 1px dashed #e5e5e5;
        }

        /* Footer */
        .r-footer {
          background: #141414;
          padding: 22px 50px;
          position: relative;
          margin-top: auto;
          z-index: 2;
          border-top: 2px solid #9DCD3D;
        }
        .r-footer-content { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
        .r-footer-info { display: flex; flex-wrap: wrap; gap: 22px; }
        .r-footer-item { font-size: 11px; color: #cccccc; letter-spacing: 0.3px; }
        .r-footer-tag {
          font-family: 'Archivo Black', sans-serif;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #9DCD3D;
        }

        @media print {
          /* Force backgrounds + gradients to print regardless of the
             user's "Background graphics" checkbox. Without this, the
             black header bar, table-bar, dark footer, and green
             grand-total row all turn white in the PDF. */
          :global(*),
          :global(*::before),
          :global(*::after) {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          :global(html), :global(body) { background: #fff !important; }
          .toolbar { display: none !important; }
          .report-page {
            box-shadow: none;
            width: 210mm;
            min-height: 297mm;
            margin: 0;
          }
          .r-service, .r-notes-box, .r-metric, .r-image-card,
          .r-party, .r-cover-banner {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  )
}
