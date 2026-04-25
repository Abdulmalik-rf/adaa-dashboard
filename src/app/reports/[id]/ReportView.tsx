'use client'

import { Printer } from 'lucide-react'

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

function fmtNum(n: any) {
  if (n === null || n === undefined || n === '') return '—'
  return Number(n).toLocaleString('en-US')
}

function rangeLabel(start: any, end: any) {
  if (!start && !end) return '—'
  if (!end) return fmtDate(start)
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${start} – ${end}`
  const sameYear = s.getFullYear() === e.getFullYear()
  const sFmt = s.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
  const eFmt = e.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${sFmt} – ${eFmt}`
}

function pillClass(status: string | null | undefined) {
  const s = String(status || '').toLowerCase()
  if (s === 'live' || s === 'published' || s === 'done') return 'live'
  if (s === 'scheduled') return 'scheduled'
  if (s === 'paused') return 'paused'
  return 'draft'
}

export default function ReportView({ report }: { report: any }) {
  const kpis: any[] = report.kpis ?? []
  const platforms: any[] = report.platforms ?? []
  const content: any[] = report.content_items ?? []
  const campaigns: any[] = report.campaigns ?? []
  const tasksDone: any[] = report.tasks_done ?? []
  const tasksPlan: any[] = report.tasks_plan ?? []

  return (
    <>
      {/* Print-only style block: hide the page chrome, leave only the report sheets. */}
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .r-page { box-shadow: none !important; margin: 0 !important; page-break-after: always; }
          .r-page:last-child { page-break-after: auto; }
        }
        .r-page { background: #fff; color: #2d3748; font-family: 'Inter', sans-serif; }
        .r-page * { box-sizing: border-box; }
        .r-page { width: 210mm; min-height: 297mm; position: relative; overflow: hidden; display: flex; flex-direction: column; }
        .r-watermark { position: absolute; bottom: 100px; right: 30px; font-family: 'Playfair Display', serif; font-size: 140px; font-weight: 700; color: rgba(200,164,94,0.03); pointer-events: none; line-height: 1; }
        .r-header { background: linear-gradient(135deg,#0a1628 0%,#132040 60%,#1a3060 100%); padding: 40px 50px 35px; position: relative; overflow: hidden; }
        .r-header::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg,#c8a45e,#e4c77b,#c8a45e); }
        .r-header-content { display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 1; }
        .r-brand-logo { display: flex; align-items: center; gap: 14px; }
        .r-logo-icon { width: 80px; height: 80px; background: #fff; padding: 5px; display: flex; align-items: center; justify-content: center; border-radius: 12px; box-shadow: 0 4px 15px rgba(200,164,94,.3); font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; color: #0a1628; }
        .r-brand-name { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; color: #fff; letter-spacing: 1px; }
        .r-brand-tagline { font-size: 11px; color: #c8a45e; letter-spacing: 3px; text-transform: uppercase; font-weight: 500; margin-top: 6px; margin-left: 94px; }
        .r-doc-title { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 700; color: #c8a45e; letter-spacing: 2px; text-align: right; }
        .r-doc-subtitle { font-size: 11px; color: rgba(255,255,255,.5); letter-spacing: 4px; text-transform: uppercase; margin-top: 6px; text-align: right; }
        .r-info-strip { display: grid; grid-template-columns: 2fr 1fr 1fr; background: #f8f9fc; border-bottom: 1px solid #dde2ec; }
        .r-info-item { padding: 16px 24px; border-right: 1px solid #dde2ec; text-align: center; }
        .r-info-item:last-child { border-right: none; }
        .r-info-label { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #9aa5b8; font-weight: 600; margin-bottom: 4px; }
        .r-info-value { font-size: 14px; font-weight: 600; color: #0a1628; }
        .r-body { padding: 35px 50px; flex: 1; }
        .r-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
        .r-party { padding: 22px 24px; border-radius: 10px; position: relative; }
        .r-party.from { background: linear-gradient(135deg,rgba(10,22,40,.03),rgba(10,22,40,.06)); border: 1px solid rgba(10,22,40,.08); }
        .r-party.to { background: linear-gradient(135deg,rgba(200,164,94,.04),rgba(200,164,94,.08)); border: 1px solid rgba(200,164,94,.15); }
        .r-party-badge { position: absolute; top: -10px; left: 20px; font-size: 8px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; padding: 4px 14px; border-radius: 20px; }
        .r-party.from .r-party-badge { background: #0a1628; color: #c8a45e; }
        .r-party.to .r-party-badge { background: #c8a45e; color: #0a1628; }
        .r-party-name { font-size: 16px; font-weight: 700; color: #0a1628; margin: 6px 0 10px; }
        .r-party-detail { font-size: 12px; color: #5a6678; line-height: 1.8; }
        .r-section-title { font-size: 10px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #0a1628; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
        .r-section-title::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg,#dde2ec,transparent); }
        .r-section-meta { font-size: 9px; color: #9aa5b8; font-weight: 500; letter-spacing: 1.5px; }
        .r-summary-box { background: linear-gradient(135deg,rgba(200,164,94,.04),rgba(200,164,94,.08)); border: 1px solid rgba(200,164,94,.2); border-left: 4px solid #c8a45e; border-radius: 10px; padding: 20px 24px; margin-bottom: 30px; }
        .r-summary-box p { font-size: 13px; color: #2d3748; line-height: 1.75; }
        .r-kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 30px; }
        .r-kpi { background: #fff; border: 1px solid #eef1f6; border-radius: 10px; padding: 18px 16px; position: relative; overflow: hidden; }
        .r-kpi::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg,#c8a45e,#e4c77b); }
        .r-kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; color: #9aa5b8; font-weight: 600; margin-bottom: 8px; }
        .r-kpi-value { font-size: 24px; font-weight: 800; color: #0a1628; line-height: 1.1; font-family: 'Playfair Display', serif; }
        .r-kpi-delta { font-size: 11px; font-weight: 600; margin-top: 6px; }
        .r-kpi-delta.up { color: #16a34a; }
        .r-kpi-delta.down { color: #dc2626; }
        .r-kpi-delta.flat { color: #9aa5b8; }
        .r-table-bar { background: linear-gradient(135deg,#0a1628,#132040); padding: 12px 24px; border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center; }
        .r-table-bar h3 { font-size: 12px; font-weight: 600; color: #c8a45e; letter-spacing: 2px; text-transform: uppercase; }
        .r-table-bar span { font-size: 10px; color: rgba(255,255,255,.5); }
        .r-table { width: 100%; border-collapse: collapse; border: 1px solid #dde2ec; border-top: none; margin-bottom: 24px; }
        .r-table thead th { background: #f8f9fc; padding: 11px 14px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #9aa5b8; text-align: left; border-bottom: 2px solid #dde2ec; }
        .r-table thead th.r { text-align: right; }
        .r-table tbody td { padding: 13px 14px; font-size: 12.5px; color: #2d3748; border-bottom: 1px solid #eef1f6; vertical-align: top; }
        .r-table tbody td.r { text-align: right; font-weight: 600; white-space: nowrap; }
        .r-table tbody tr:last-child td { border-bottom: none; }
        .r-table .platform { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; color: #0a1628; }
        .r-platform-dot { width: 8px; height: 8px; border-radius: 50%; background: #c8a45e; }
        .r-pill { display: inline-block; font-size: 9.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; }
        .r-pill.live { background: rgba(22,163,74,.12); color: #16a34a; }
        .r-pill.scheduled { background: rgba(200,164,94,.15); color: #a6863a; }
        .r-pill.draft { background: rgba(154,165,184,.15); color: #5a6678; }
        .r-pill.paused { background: rgba(220,38,38,.12); color: #dc2626; }
        .r-content-cell { display: flex; gap: 12px; align-items: flex-start; }
        .r-content-thumb { width: 44px; height: 44px; min-width: 44px; border-radius: 8px; background: linear-gradient(135deg,#f0f1f5,#e7e9ef); display: flex; align-items: center; justify-content: center; font-size: 16px; color: #9aa5b8; }
        .r-content-thumb-img { width: 44px; height: 44px; min-width: 44px; border-radius: 8px; object-fit: cover; background: #f0f1f5; }
        .r-content-title { font-weight: 600; color: #0a1628; margin-bottom: 3px; }
        .r-content-meta { font-size: 11px; color: #9aa5b8; }
        .r-list { margin-bottom: 24px; }
        .r-list-item { display: flex; gap: 14px; padding: 12px 0; border-bottom: 1px solid #eef1f6; align-items: flex-start; }
        .r-list-item:last-child { border-bottom: none; }
        .r-list-marker { width: 22px; height: 22px; min-width: 22px; border-radius: 50%; background: linear-gradient(135deg,#c8a45e,#a6863a); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-top: 1px; }
        .r-list-marker.done { background: linear-gradient(135deg,#16a34a,#15803d); }
        .r-list-marker.plan { background: transparent; color: #c8a45e; border: 1.5px dashed #c8a45e; }
        .r-list-body { flex: 1; }
        .r-list-title { font-size: 13px; font-weight: 600; color: #0a1628; margin-bottom: 2px; }
        .r-list-meta { font-size: 11px; color: #5a6678; line-height: 1.6; }
        .r-notes-box { background: #f8f9fc; border: 1px solid #eef1f6; border-radius: 10px; padding: 18px 20px; margin-bottom: 24px; }
        .r-notes-box p { font-size: 12px; color: #5a6678; line-height: 1.75; }
        .r-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
        .r-footer { background: linear-gradient(135deg,#0a1628,#132040); padding: 22px 50px; position: relative; margin-top: auto; }
        .r-footer::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg,#c8a45e,#e4c77b,#c8a45e); }
        .r-footer-content { display: flex; justify-content: space-between; align-items: center; }
        .r-footer-info { display: flex; gap: 30px; }
        .r-footer-item { font-size: 11px; color: rgba(255,255,255,.6); }
        .r-footer-page { font-size: 10px; letter-spacing: 2px; color: rgba(200,164,94,.8); text-transform: uppercase; }
      `}</style>

      <div className="no-print mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">{report.report_number}</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {report.client_name_snapshot ?? 'Unlinked'} · {rangeLabel(report.period_start, report.period_end)} · status: {report.status}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="btn btn-primary flex items-center gap-2"
        >
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      <div style={{ background: '#ecedf2', padding: '20px 0', minHeight: '100vh' }}>
        <div className="r-page" style={{ margin: '0 auto 24px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div className="r-watermark">{AGENCY.name}</div>
          <div className="r-header">
            <div className="r-header-content">
              <div>
                <div className="r-brand-logo">
                  <div className="r-logo-icon">{AGENCY.name.charAt(0)}</div>
                  <div className="r-brand-name">{AGENCY.name}</div>
                </div>
                <div className="r-brand-tagline">{AGENCY.tagline}</div>
              </div>
              <div>
                <div className="r-doc-title">Weekly Report</div>
                <div className="r-doc-subtitle">Performance &amp; Delivery Recap</div>
              </div>
            </div>
          </div>

          <div className="r-info-strip">
            <div className="r-info-item">
              <div className="r-info-label">Reporting Period</div>
              <div className="r-info-value">{rangeLabel(report.period_start, report.period_end)}</div>
            </div>
            <div className="r-info-item">
              <div className="r-info-label">Report #</div>
              <div className="r-info-value">{report.report_number}</div>
            </div>
            <div className="r-info-item">
              <div className="r-info-label">Issued</div>
              <div className="r-info-value">{fmtDate(report.issue_date)}</div>
            </div>
          </div>

          <div className="r-body">
            <div className="r-parties">
              <div className="r-party from">
                <div className="r-party-badge">Prepared by</div>
                <div className="r-party-name">{AGENCY.name} Agency</div>
                <div className="r-party-detail">
                  📍 {AGENCY.address}<br />
                  📞 {AGENCY.phone}<br />
                  ✉ {AGENCY.email}
                </div>
              </div>
              <div className="r-party to">
                <div className="r-party-badge">Prepared for</div>
                <div className="r-party-name">{report.client_name_snapshot || '—'}</div>
                <div className="r-party-detail">
                  {report.prepared_for_contact && <>👤 {report.prepared_for_contact}<br /></>}
                  {report.prepared_for_meta && <>🏢 {report.prepared_for_meta}<br /></>}
                  {report.prepared_for_email && <>✉ {report.prepared_for_email}</>}
                  {!(report.prepared_for_contact || report.prepared_for_meta || report.prepared_for_email) && '—'}
                </div>
              </div>
            </div>

            {report.summary && (
              <>
                <div className="r-section-title">Executive Summary</div>
                <div className="r-summary-box"><p>{report.summary}</p></div>
              </>
            )}

            <div className="r-section-title">
              Performance Snapshot <span className="r-section-meta">Week-over-week</span>
            </div>
            <div className="r-kpi-grid">
              {kpis.length === 0 ? (
                <div className="r-kpi">
                  <div className="r-kpi-label">No metrics yet</div>
                  <div className="r-kpi-value">—</div>
                </div>
              ) : (
                kpis.map((k, i) => {
                  const dirClass = k.delta_direction === 'up' ? 'up' : k.delta_direction === 'down' ? 'down' : 'flat'
                  const arrow = k.delta_direction === 'up' ? '▲' : k.delta_direction === 'down' ? '▼' : '—'
                  return (
                    <div className="r-kpi" key={i}>
                      <div className="r-kpi-label">{k.label}</div>
                      <div className="r-kpi-value">{k.value}</div>
                      {k.delta_label && (
                        <div className={`r-kpi-delta ${dirClass}`}>{arrow} {k.delta_label}</div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {platforms.length > 0 && (
              <>
                <div className="r-table-bar">
                  <h3>Social Media Performance</h3>
                  <span>{platforms.length} platform{platforms.length === 1 ? '' : 's'}</span>
                </div>
                <table className="r-table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th className="r">Followers</th>
                      <th className="r">Δ Week</th>
                      <th className="r">Posts</th>
                      <th className="r">Reach</th>
                      <th className="r">Engagement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platforms.map((r, i) => {
                      const dColor = (r.delta_followers ?? 0) > 0 ? '#16a34a' : (r.delta_followers ?? 0) < 0 ? '#dc2626' : '#9aa5b8'
                      const dPrefix = (r.delta_followers ?? 0) > 0 ? '+' : ''
                      return (
                        <tr key={i}>
                          <td>
                            <span className="platform">
                              <span className="r-platform-dot" style={{ background: r.dot_color || '#c8a45e' }}></span>
                              {r.platform}
                            </span>
                          </td>
                          <td className="r">{fmtNum(r.followers)}</td>
                          <td className="r" style={{ color: dColor }}>
                            {r.delta_followers === null || r.delta_followers === undefined ? '—' : `${dPrefix}${fmtNum(r.delta_followers)}`}
                          </td>
                          <td className="r">{fmtNum(r.posts_count)}</td>
                          <td className="r">{fmtNum(r.reach)}</td>
                          <td className="r">{r.engagement_rate === null || r.engagement_rate === undefined ? '—' : `${r.engagement_rate}%`}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="r-footer">
            <div className="r-footer-content">
              <div className="r-footer-info">
                <div className="r-footer-item">📍 {AGENCY.address}</div>
                <div className="r-footer-item">📞 {AGENCY.phone}</div>
                <div className="r-footer-item">✉ {AGENCY.email}</div>
              </div>
              <div className="r-footer-page">Page 1</div>
            </div>
          </div>
        </div>

        {(content.length > 0 || campaigns.length > 0 || tasksDone.length > 0 || tasksPlan.length > 0 || report.notes) && (
          <div className="r-page" style={{ margin: '0 auto 24px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <div className="r-watermark">{AGENCY.name}</div>
            <div className="r-body" style={{ paddingTop: 50 }}>
              {content.length > 0 && (
                <>
                  <div className="r-table-bar">
                    <h3>Content Delivered</h3>
                    <span>{content.length} item{content.length === 1 ? '' : 's'}</span>
                  </div>
                  <table className="r-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Platform</th>
                        <th>Type</th>
                        <th className="r">Published</th>
                        <th className="r">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {content.map((r, i) => {
                        const ctype = String(r.content_type || '').toLowerCase()
                        const icon = ctype.includes('reel') ? '🎬' : ctype.includes('story') ? '📱' : '🖼'
                        return (
                          <tr key={i}>
                            <td>
                              <div className="r-content-cell">
                                {r.media_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={r.media_url} alt="" className="r-content-thumb-img" />
                                ) : (
                                  <div className="r-content-thumb">{icon}</div>
                                )}
                                <div>
                                  <div className="r-content-title">{r.title}</div>
                                  {r.campaign_label && (
                                    <div className="r-content-meta">Campaign · {r.campaign_label}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>{r.platform || '—'}</td>
                            <td>{r.content_type || '—'}</td>
                            <td className="r">{fmtDate(r.publish_date)}</td>
                            <td className="r">
                              <span className={`r-pill ${pillClass(r.status)}`}>{r.status || '—'}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {campaigns.length > 0 && (
                <>
                  <div className="r-table-bar">
                    <h3>Active Campaigns</h3>
                    <span>{campaigns.length} running</span>
                  </div>
                  <table className="r-table">
                    <thead>
                      <tr>
                        <th>Campaign</th>
                        <th>Platform</th>
                        <th>Objective</th>
                        <th className="r">Spend</th>
                        <th className="r">Result</th>
                        <th className="r">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((r, i) => (
                        <tr key={i}>
                          <td><strong>{r.name}</strong></td>
                          <td>{r.platform || '—'}</td>
                          <td>{r.objective || '—'}</td>
                          <td className="r">
                            {r.spend === null || r.spend === undefined
                              ? '—'
                              : `${fmtNum(r.spend)} ${r.currency || 'SAR'}`}
                          </td>
                          <td className="r">{r.result || '—'}</td>
                          <td className="r">
                            <span className={`r-pill ${pillClass(r.status)}`}>{r.status || 'live'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <div className="r-two-col">
                <div>
                  <div className="r-section-title">Tasks Completed</div>
                  <div className="r-list">
                    {tasksDone.length === 0 && (
                      <div className="r-list-item">
                        <div className="r-list-body">
                          <div className="r-list-meta">— none —</div>
                        </div>
                      </div>
                    )}
                    {tasksDone.map((t, i) => (
                      <div className="r-list-item" key={i}>
                        <div className="r-list-marker done">✓</div>
                        <div className="r-list-body">
                          <div className="r-list-title">{t.title}</div>
                          <div className="r-list-meta">
                            {[t.owner ? `Owner: ${t.owner}` : '', t.date_label].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="r-section-title">Next Week&apos;s Plan</div>
                  <div className="r-list">
                    {tasksPlan.length === 0 && (
                      <div className="r-list-item">
                        <div className="r-list-body">
                          <div className="r-list-meta">— none —</div>
                        </div>
                      </div>
                    )}
                    {tasksPlan.map((t, i) => (
                      <div className="r-list-item" key={i}>
                        <div className="r-list-marker plan">→</div>
                        <div className="r-list-body">
                          <div className="r-list-title">{t.title}</div>
                          <div className="r-list-meta">
                            {[t.owner ? `Owner: ${t.owner}` : '', t.date_label].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {report.notes && (
                <>
                  <div className="r-section-title">Notes &amp; Recommendations</div>
                  <div className="r-notes-box"><p>{report.notes}</p></div>
                </>
              )}
            </div>

            <div className="r-footer">
              <div className="r-footer-content">
                <div className="r-footer-info">
                  <div className="r-footer-item">📍 {AGENCY.address}</div>
                  <div className="r-footer-item">📞 {AGENCY.phone}</div>
                  <div className="r-footer-item">✉ {AGENCY.email}</div>
                </div>
                <div className="r-footer-page">Page 2</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
