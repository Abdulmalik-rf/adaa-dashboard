// Renders a weekly report row to a PDF buffer. Mirrors the visual style of
// templates/weekly_report.html and matches the Adaa quotation generator's
// puppeteer-launch-per-PDF pattern. Lazy-loads puppeteer so the rest of the
// agent works on machines without it.

let _puppeteer = null
async function getPuppeteer() {
  if (_puppeteer) return _puppeteer
  try {
    const mod = await import('puppeteer')
    _puppeteer = mod.default ?? mod
    return _puppeteer
  } catch {
    throw new Error('puppeteer is not installed — run `npm install` in whatsapp-agent/')
  }
}

const AGENCY = {
  name: 'Adaa',
  tagline: 'Advertisement & Digital Solutions',
  phone: '+966 577 602 467',
  address: 'Saudi Arabia — Khobar',
  email: 'abdulmalikalrifaee@outlook.com',
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function fmtDate(val) {
  if (!val) return '—'
  const d = new Date(val + (typeof val === 'string' && val.length === 10 ? 'T00:00:00' : ''))
  return isNaN(d) ? esc(val) : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtNum(n) {
  if (n === null || n === undefined || n === '') return '—'
  return Number(n).toLocaleString('en-US')
}
function rangeLabel(start, end) {
  if (!start && !end) return '—'
  if (!end) return fmtDate(start)
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (isNaN(s) || isNaN(e)) return `${esc(start)} – ${esc(end)}`
  const sameYear = s.getFullYear() === e.getFullYear()
  const sFmt = s.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
  const eFmt = e.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${sFmt} – ${eFmt}`
}

// ----- section renderers ----------------------------------------------------

function renderKpis(kpis) {
  if (!kpis || kpis.length === 0) {
    return `<div class="r-kpi-grid">
      <div class="r-kpi"><div class="r-kpi-label">No metrics yet</div><div class="r-kpi-value">—</div></div>
    </div>`
  }
  const cells = kpis.map(k => {
    const dirClass = k.delta_direction === 'up' ? 'up' : k.delta_direction === 'down' ? 'down' : 'flat'
    const arrow = k.delta_direction === 'up' ? '▲' : k.delta_direction === 'down' ? '▼' : '—'
    const delta = k.delta_label
      ? `<div class="r-kpi-delta ${dirClass}">${arrow} ${esc(k.delta_label)}</div>`
      : ''
    return `<div class="r-kpi">
      <div class="r-kpi-label">${esc(k.label)}</div>
      <div class="r-kpi-value">${esc(k.value)}</div>
      ${delta}
    </div>`
  }).join('')
  return `<div class="r-kpi-grid">${cells}</div>`
}

function renderPlatforms(rows) {
  if (!rows || rows.length === 0) return ''
  const body = rows.map(r => {
    const dot = r.dot_color ? `<span class="r-platform-dot" style="background:${esc(r.dot_color)}"></span>` : `<span class="r-platform-dot"></span>`
    const dColor = (r.delta_followers ?? 0) > 0 ? '#16a34a' : (r.delta_followers ?? 0) < 0 ? '#dc2626' : '#9aa5b8'
    const dPrefix = (r.delta_followers ?? 0) > 0 ? '+' : ''
    return `<tr>
      <td><span class="platform">${dot}${esc(r.platform)}</span></td>
      <td class="r">${fmtNum(r.followers)}</td>
      <td class="r" style="color:${dColor}">${r.delta_followers === null || r.delta_followers === undefined ? '—' : `${dPrefix}${fmtNum(r.delta_followers)}`}</td>
      <td class="r">${fmtNum(r.posts_count)}</td>
      <td class="r">${fmtNum(r.reach)}</td>
      <td class="r">${r.engagement_rate === null || r.engagement_rate === undefined ? '—' : `${r.engagement_rate}%`}</td>
    </tr>`
  }).join('')
  return `<div class="r-table-bar"><h3>Social Media Performance</h3><span>${rows.length} platform${rows.length === 1 ? '' : 's'}</span></div>
    <table class="r-table">
      <thead><tr>
        <th>Platform</th><th class="r">Followers</th><th class="r">Δ Week</th>
        <th class="r">Posts</th><th class="r">Reach</th><th class="r">Engagement</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`
}

function pillClass(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'live' || s === 'published' || s === 'done') return 'live'
  if (s === 'scheduled') return 'scheduled'
  if (s === 'paused') return 'paused'
  return 'draft'
}

function renderContent(rows) {
  if (!rows || rows.length === 0) return ''
  const body = rows.map(r => {
    const icon = (r.content_type || '').toLowerCase().includes('reel') ? '🎬'
              : (r.content_type || '').toLowerCase().includes('story') ? '📱'
              : '🖼'
    const thumb = r.media_url
      ? `<img src="${esc(r.media_url)}" class="r-content-thumb-img" alt="">`
      : `<div class="r-content-thumb">${icon}</div>`
    return `<tr>
      <td>
        <div class="r-content-cell">
          ${thumb}
          <div>
            <div class="r-content-title">${esc(r.title)}</div>
            ${r.campaign_label ? `<div class="r-content-meta">Campaign · ${esc(r.campaign_label)}</div>` : ''}
          </div>
        </div>
      </td>
      <td>${esc(r.platform)}</td>
      <td>${esc(r.content_type)}</td>
      <td class="r">${fmtDate(r.publish_date)}</td>
      <td class="r"><span class="r-pill ${pillClass(r.status)}">${esc(r.status || '—')}</span></td>
    </tr>`
  }).join('')
  return `<div class="r-table-bar"><h3>Content Delivered</h3><span>${rows.length} item${rows.length === 1 ? '' : 's'}</span></div>
    <table class="r-table">
      <thead><tr>
        <th>Item</th><th>Platform</th><th>Type</th><th class="r">Published</th><th class="r">Status</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`
}

function renderCampaigns(rows) {
  if (!rows || rows.length === 0) return ''
  const body = rows.map(r => `<tr>
    <td><strong>${esc(r.name)}</strong></td>
    <td>${esc(r.platform)}</td>
    <td>${esc(r.objective)}</td>
    <td class="r">${r.spend === null || r.spend === undefined ? '—' : `${fmtNum(r.spend)} ${esc(r.currency || 'SAR')}`}</td>
    <td class="r">${esc(r.result || '—')}</td>
    <td class="r"><span class="r-pill ${pillClass(r.status)}">${esc(r.status || 'live')}</span></td>
  </tr>`).join('')
  return `<div class="r-table-bar"><h3>Active Campaigns</h3><span>${rows.length} running</span></div>
    <table class="r-table">
      <thead><tr>
        <th>Campaign</th><th>Platform</th><th>Objective</th>
        <th class="r">Spend</th><th class="r">Result</th><th class="r">Status</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`
}

function renderTaskList(rows, kind) {
  if (!rows || rows.length === 0) {
    return `<div class="r-list"><div class="r-list-item"><div class="r-list-body"><div class="r-list-meta">— none —</div></div></div></div>`
  }
  const markerCls = kind === 'plan' ? 'plan' : 'done'
  const markerSym = kind === 'plan' ? '→' : '✓'
  const items = rows.map(t => `<div class="r-list-item">
    <div class="r-list-marker ${markerCls}">${markerSym}</div>
    <div class="r-list-body">
      <div class="r-list-title">${esc(t.title)}</div>
      <div class="r-list-meta">${[t.owner ? `Owner: ${esc(t.owner)}` : '', esc(t.date_label)].filter(Boolean).join(' · ') || '—'}</div>
    </div>
  </div>`).join('')
  return `<div class="r-list">${items}</div>`
}

function renderHtml(report) {
  const kpis = report.kpis ?? []
  const platforms = report.platforms ?? []
  const content = report.content_items ?? []
  const campaigns = report.campaigns ?? []
  const tasksDone = report.tasks_done ?? []
  const tasksPlan = report.tasks_plan ?? []

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(report.report_number)} — ${esc(AGENCY.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#fff;color:#2d3748}
.r-page{width:210mm;min-height:297mm;position:relative;overflow:hidden;display:flex;flex-direction:column;background:#fff}
.r-watermark{position:absolute;bottom:100px;right:30px;font-family:'Playfair Display',serif;font-size:140px;font-weight:700;color:rgba(200,164,94,0.03);pointer-events:none;line-height:1}
.r-header{background:linear-gradient(135deg,#0a1628 0%,#132040 60%,#1a3060 100%);padding:40px 50px 35px;position:relative;overflow:hidden}
.r-header::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#c8a45e,#e4c77b,#c8a45e)}
.r-header-content{display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1}
.r-brand-logo{display:flex;align-items:center;gap:14px}
.r-logo-icon{width:80px;height:80px;background:#fff;padding:5px;display:flex;align-items:center;justify-content:center;border-radius:12px;box-shadow:0 4px 15px rgba(200,164,94,.3);font-family:'Playfair Display',serif;font-size:28px;font-weight:700;color:#0a1628}
.r-brand-name{font-family:'Playfair Display',serif;font-size:28px;font-weight:700;color:#fff;letter-spacing:1px}
.r-brand-tagline{font-size:11px;color:#c8a45e;letter-spacing:3px;text-transform:uppercase;font-weight:500;margin-top:6px;margin-left:94px}
.r-doc-title{font-family:'Playfair Display',serif;font-size:36px;font-weight:700;color:#c8a45e;letter-spacing:2px;text-align:right}
.r-doc-subtitle{font-size:11px;color:rgba(255,255,255,.5);letter-spacing:4px;text-transform:uppercase;margin-top:6px;text-align:right}
.r-info-strip{display:grid;grid-template-columns:2fr 1fr 1fr;background:#f8f9fc;border-bottom:1px solid #dde2ec}
.r-info-item{padding:16px 24px;border-right:1px solid #dde2ec;text-align:center}
.r-info-item:last-child{border-right:none}
.r-info-label{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:#9aa5b8;font-weight:600;margin-bottom:4px}
.r-info-value{font-size:14px;font-weight:600;color:#0a1628}
.r-body{padding:35px 50px;flex:1}
.r-parties{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:30px}
.r-party{padding:22px 24px;border-radius:10px;position:relative}
.r-party.from{background:linear-gradient(135deg,rgba(10,22,40,.03),rgba(10,22,40,.06));border:1px solid rgba(10,22,40,.08)}
.r-party.to{background:linear-gradient(135deg,rgba(200,164,94,.04),rgba(200,164,94,.08));border:1px solid rgba(200,164,94,.15)}
.r-party-badge{position:absolute;top:-10px;left:20px;font-size:8px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;padding:4px 14px;border-radius:20px}
.r-party.from .r-party-badge{background:#0a1628;color:#c8a45e}
.r-party.to .r-party-badge{background:#c8a45e;color:#0a1628}
.r-party-name{font-size:16px;font-weight:700;color:#0a1628;margin:6px 0 10px}
.r-party-detail{font-size:12px;color:#5a6678;line-height:1.8}
.r-section-title{font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#0a1628;margin-bottom:14px;display:flex;align-items:center;gap:10px}
.r-section-title::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#dde2ec,transparent)}
.r-section-title .r-section-meta{font-size:9px;color:#9aa5b8;font-weight:500;letter-spacing:1.5px}
.r-summary-box{background:linear-gradient(135deg,rgba(200,164,94,.04),rgba(200,164,94,.08));border:1px solid rgba(200,164,94,.2);border-left:4px solid #c8a45e;border-radius:10px;padding:20px 24px;margin-bottom:30px}
.r-summary-box p{font-size:13px;color:#2d3748;line-height:1.75}
.r-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:30px}
.r-kpi{background:#fff;border:1px solid #eef1f6;border-radius:10px;padding:18px 16px;position:relative;overflow:hidden}
.r-kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#c8a45e,#e4c77b)}
.r-kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#9aa5b8;font-weight:600;margin-bottom:8px}
.r-kpi-value{font-size:24px;font-weight:800;color:#0a1628;line-height:1.1;font-family:'Playfair Display',serif}
.r-kpi-delta{font-size:11px;font-weight:600;margin-top:6px}
.r-kpi-delta.up{color:#16a34a}
.r-kpi-delta.down{color:#dc2626}
.r-kpi-delta.flat{color:#9aa5b8}
.r-table-bar{background:linear-gradient(135deg,#0a1628,#132040);padding:12px 24px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center}
.r-table-bar h3{font-size:12px;font-weight:600;color:#c8a45e;letter-spacing:2px;text-transform:uppercase}
.r-table-bar span{font-size:10px;color:rgba(255,255,255,.5)}
.r-table{width:100%;border-collapse:collapse;border:1px solid #dde2ec;border-top:none;margin-bottom:24px}
.r-table thead th{background:#f8f9fc;padding:11px 14px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#9aa5b8;text-align:left;border-bottom:2px solid #dde2ec}
.r-table thead th.r{text-align:right}
.r-table tbody td{padding:13px 14px;font-size:12.5px;color:#2d3748;border-bottom:1px solid #eef1f6;vertical-align:top}
.r-table tbody td.r{text-align:right;font-weight:600;white-space:nowrap}
.r-table tbody tr:last-child td{border-bottom:none}
.r-table .platform{display:inline-flex;align-items:center;gap:8px;font-weight:600;color:#0a1628}
.r-platform-dot{width:8px;height:8px;border-radius:50%;background:#c8a45e}
.r-pill{display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:3px 8px;border-radius:999px}
.r-pill.live{background:rgba(22,163,74,.12);color:#16a34a}
.r-pill.scheduled{background:rgba(200,164,94,.15);color:#a6863a}
.r-pill.draft{background:rgba(154,165,184,.15);color:#5a6678}
.r-pill.paused{background:rgba(220,38,38,.12);color:#dc2626}
.r-content-cell{display:flex;gap:12px;align-items:flex-start}
.r-content-thumb{width:44px;height:44px;min-width:44px;border-radius:8px;background:linear-gradient(135deg,#f0f1f5,#e7e9ef);display:flex;align-items:center;justify-content:center;font-size:16px;color:#9aa5b8}
.r-content-thumb-img{width:44px;height:44px;min-width:44px;border-radius:8px;object-fit:cover;background:#f0f1f5}
.r-content-title{font-weight:600;color:#0a1628;margin-bottom:3px}
.r-content-meta{font-size:11px;color:#9aa5b8}
.r-list{margin-bottom:24px}
.r-list-item{display:flex;gap:14px;padding:12px 0;border-bottom:1px solid #eef1f6;align-items:flex-start}
.r-list-item:last-child{border-bottom:none}
.r-list-marker{width:22px;height:22px;min-width:22px;border-radius:50%;background:linear-gradient(135deg,#c8a45e,#a6863a);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;margin-top:1px}
.r-list-marker.done{background:linear-gradient(135deg,#16a34a,#15803d)}
.r-list-marker.plan{background:transparent;color:#c8a45e;border:1.5px dashed #c8a45e}
.r-list-body{flex:1}
.r-list-title{font-size:13px;font-weight:600;color:#0a1628;margin-bottom:2px}
.r-list-meta{font-size:11px;color:#5a6678;line-height:1.6}
.r-notes-box{background:#f8f9fc;border:1px solid #eef1f6;border-radius:10px;padding:18px 20px;margin-bottom:24px}
.r-notes-box p{font-size:12px;color:#5a6678;line-height:1.75}
.r-two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px}
.r-footer{background:linear-gradient(135deg,#0a1628,#132040);padding:22px 50px;position:relative;margin-top:auto}
.r-footer::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#c8a45e,#e4c77b,#c8a45e)}
.r-footer-content{display:flex;justify-content:space-between;align-items:center}
.r-footer-info{display:flex;gap:30px}
.r-footer-item{font-size:11px;color:rgba(255,255,255,.6)}
.r-footer-page{font-size:10px;letter-spacing:2px;color:rgba(200,164,94,.8);text-transform:uppercase}
@page{size:A4;margin:0}
@media print{
  .r-page{page-break-after:always}
  .r-page:last-child{page-break-after:auto}
  .r-table tbody tr,.r-summary-box,.r-list-item,.r-kpi,.r-notes-box{page-break-inside:avoid}
}
</style>
</head><body>

<div class="r-page">
  <div class="r-watermark">${esc(AGENCY.name)}</div>
  <div class="r-header"><div class="r-header-content">
    <div>
      <div class="r-brand-logo">
        <div class="r-logo-icon">${esc(AGENCY.name.charAt(0))}</div>
        <div class="r-brand-name">${esc(AGENCY.name)}</div>
      </div>
      <div class="r-brand-tagline">${esc(AGENCY.tagline)}</div>
    </div>
    <div>
      <div class="r-doc-title">Weekly Report</div>
      <div class="r-doc-subtitle">Performance &amp; Delivery Recap</div>
    </div>
  </div></div>

  <div class="r-info-strip">
    <div class="r-info-item"><div class="r-info-label">Reporting Period</div><div class="r-info-value">${esc(rangeLabel(report.period_start, report.period_end))}</div></div>
    <div class="r-info-item"><div class="r-info-label">Report #</div><div class="r-info-value">${esc(report.report_number)}</div></div>
    <div class="r-info-item"><div class="r-info-label">Issued</div><div class="r-info-value">${fmtDate(report.issue_date)}</div></div>
  </div>

  <div class="r-body">
    <div class="r-parties">
      <div class="r-party from">
        <div class="r-party-badge">Prepared by</div>
        <div class="r-party-name">${esc(AGENCY.name)} Agency</div>
        <div class="r-party-detail">📍 ${esc(AGENCY.address)}<br>📞 ${esc(AGENCY.phone)}<br>✉ ${esc(AGENCY.email)}</div>
      </div>
      <div class="r-party to">
        <div class="r-party-badge">Prepared for</div>
        <div class="r-party-name">${esc(report.client_name_snapshot || '—')}</div>
        <div class="r-party-detail">${[
          report.prepared_for_contact ? `👤 ${esc(report.prepared_for_contact)}` : '',
          report.prepared_for_meta ? `🏢 ${esc(report.prepared_for_meta)}` : '',
          report.prepared_for_email ? `✉ ${esc(report.prepared_for_email)}` : '',
        ].filter(Boolean).join('<br>') || '—'}</div>
      </div>
    </div>

    ${report.summary ? `
    <div class="r-section-title">Executive Summary</div>
    <div class="r-summary-box"><p>${esc(report.summary)}</p></div>
    ` : ''}

    <div class="r-section-title">Performance Snapshot <span class="r-section-meta">Week-over-week</span></div>
    ${renderKpis(kpis)}

    ${platforms.length ? renderPlatforms(platforms) : ''}
  </div>

  <div class="r-footer"><div class="r-footer-content">
    <div class="r-footer-info">
      <div class="r-footer-item">📍 ${esc(AGENCY.address)}</div>
      <div class="r-footer-item">📞 ${esc(AGENCY.phone)}</div>
      <div class="r-footer-item">✉ ${esc(AGENCY.email)}</div>
    </div>
    <div class="r-footer-page">Page 1</div>
  </div></div>
</div>

<div class="r-page">
  <div class="r-watermark">${esc(AGENCY.name)}</div>
  <div class="r-body" style="padding-top:50px">
    ${content.length ? renderContent(content) : ''}
    ${campaigns.length ? renderCampaigns(campaigns) : ''}

    <div class="r-two-col">
      <div>
        <div class="r-section-title">Tasks Completed</div>
        ${renderTaskList(tasksDone, 'done')}
      </div>
      <div>
        <div class="r-section-title">Next Week's Plan</div>
        ${renderTaskList(tasksPlan, 'plan')}
      </div>
    </div>

    ${report.notes ? `
    <div class="r-section-title">Notes &amp; Recommendations</div>
    <div class="r-notes-box"><p>${esc(report.notes)}</p></div>
    ` : ''}
  </div>

  <div class="r-footer"><div class="r-footer-content">
    <div class="r-footer-info">
      <div class="r-footer-item">📍 ${esc(AGENCY.address)}</div>
      <div class="r-footer-item">📞 ${esc(AGENCY.phone)}</div>
      <div class="r-footer-item">✉ ${esc(AGENCY.email)}</div>
    </div>
    <div class="r-footer-page">Page 2</div>
  </div></div>
</div>

</body></html>`
}

export async function generateWeeklyReportPdf(report) {
  const puppeteer = await getPuppeteer()
  const html = renderHtml(report)
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    })
  } finally {
    await browser.close()
  }
}
