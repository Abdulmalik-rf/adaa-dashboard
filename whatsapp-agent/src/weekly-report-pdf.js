// Renders a weekly report row to a PDF buffer. Mirrors the dashboard's
// /reports/[id] viewer 1:1 — service-block model, simple layout. Launches
// a fresh headless Chromium per PDF (~1-2s on a warm cache) so we don't
// keep a browser process around. Puppeteer is loaded lazily so the rest
// of the agent still works on machines without it.

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

function renderServiceBlock(svc) {
  const metrics = (svc.metrics ?? []).map((m) => `
    <div class="r-metric">
      <div class="r-metric-label">${esc(m.label)}</div>
      <div class="r-metric-value">${esc(m.value)}</div>
    </div>`).join('')

  const items = (svc.items ?? []).map((i) => `
    <li>
      <strong>${esc(i.title)}</strong>
      ${i.detail ? `<span class="r-item-detail">${esc(i.detail)}</span>` : ''}
    </li>`).join('')

  const images = (svc.images ?? []).map((i) => `
    <div class="r-image-card">
      <img src="${esc(i.url)}" alt="">
      ${i.caption ? `<div class="r-image-caption">${esc(i.caption)}</div>` : ''}
    </div>`).join('')

  return `
  <div class="r-section">
    <div class="r-section-head">
      <div class="r-section-icon">${esc(svc.icon || '⭐')}</div>
      <div class="r-section-title">${esc(svc.title)}</div>
    </div>
    ${svc.body ? `<div class="r-section-body">${esc(svc.body)}</div>` : ''}
    ${metrics ? `<div class="r-metric-grid">${metrics}</div>` : ''}
    ${items ? `<ul class="r-items">${items}</ul>` : ''}
    ${images ? `<div class="r-images">${images}</div>` : ''}
  </div>`
}

// ----- Legacy renderer ------------------------------------------------------
// For old reports that pre-date the services-array model. Renders whatever
// they have in their old per-section columns so existing rows still print.
function renderLegacy(report) {
  const out = []
  const k = report.kpis ?? []
  const p = report.platforms ?? []
  const c = report.content_items ?? []
  const cm = report.campaigns ?? []
  const td = report.tasks_done ?? []
  const tp = report.tasks_plan ?? []
  if (k.length) {
    const cells = k.map((m) => `
      <div class="r-metric">
        <div class="r-metric-label">${esc(m.label)}</div>
        <div class="r-metric-value">${esc(m.value)}</div>
      </div>`).join('')
    out.push(`<div class="r-section">
      <div class="r-section-head"><div class="r-section-icon">📊</div><div class="r-section-title">Performance Snapshot</div></div>
      <div class="r-metric-grid">${cells}</div>
    </div>`)
  }
  if (p.length) {
    const rows = p.map((r) => `
      <li><strong>${esc(r.platform)}</strong>
        <span class="r-item-detail">${esc(r.followers ?? '—')} followers · ${esc(r.posts_count ?? 0)} posts · ${esc(r.engagement_rate ?? '—')}% engagement</span>
      </li>`).join('')
    out.push(`<div class="r-section">
      <div class="r-section-head"><div class="r-section-icon">📱</div><div class="r-section-title">Social Media</div></div>
      <ul class="r-items">${rows}</ul>
    </div>`)
  }
  if (c.length) {
    const rows = c.map((r) => `<li><strong>${esc(r.title)}</strong>
      <span class="r-item-detail">${esc(r.platform || '')}${r.content_type ? ' · ' + esc(r.content_type) : ''}${r.publish_date ? ' · ' + esc(r.publish_date) : ''}</span></li>`).join('')
    out.push(`<div class="r-section">
      <div class="r-section-head"><div class="r-section-icon">🎬</div><div class="r-section-title">Content Delivered</div></div>
      <ul class="r-items">${rows}</ul>
    </div>`)
  }
  if (cm.length) {
    const rows = cm.map((r) => `<li><strong>${esc(r.name)}</strong>
      <span class="r-item-detail">${esc(r.platform || '')}${r.objective ? ' · ' + esc(r.objective) : ''}${r.spend ? ' · ' + esc(r.spend) + ' ' + esc(r.currency || 'SAR') : ''}</span></li>`).join('')
    out.push(`<div class="r-section">
      <div class="r-section-head"><div class="r-section-icon">🎯</div><div class="r-section-title">Active Campaigns</div></div>
      <ul class="r-items">${rows}</ul>
    </div>`)
  }
  if (td.length || tp.length) {
    const done = td.map((t) => `<li><strong>✓ ${esc(t.title)}</strong>${t.owner || t.date_label ? `<span class="r-item-detail">${[t.owner, t.date_label].filter(Boolean).map(esc).join(' · ')}</span>` : ''}</li>`).join('')
    const plan = tp.map((t) => `<li><strong>→ ${esc(t.title)}</strong>${t.owner || t.date_label ? `<span class="r-item-detail">${[t.owner, t.date_label].filter(Boolean).map(esc).join(' · ')}</span>` : ''}</li>`).join('')
    out.push(`<div class="r-section">
      <div class="r-section-head"><div class="r-section-icon">📋</div><div class="r-section-title">Tasks &amp; Plan</div></div>
      ${done ? `<ul class="r-items">${done}</ul>` : ''}
      ${plan ? `<ul class="r-items">${plan}</ul>` : ''}
    </div>`)
  }
  return out.join('')
}

function renderHtml(report) {
  const services = Array.isArray(report.services) ? report.services : []
  const customerName = report.customer_name ?? report.client_name_snapshot ?? '—'
  const sectionsHtml = services.length
    ? services.map(renderServiceBlock).join('')
    : renderLegacy(report)

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(report.report_number)} — ${esc(AGENCY.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;color:#1f2937;background:#fff}
.r-sheet{font-family:'Inter',system-ui,sans-serif;color:#1f2937}
.r-strip{display:flex;align-items:center;justify-content:space-between;padding:22px 32px;background:#0a1628;color:#fff}
.r-brand{display:flex;align-items:center;gap:12px}
.r-brand-mark{width:36px;height:36px;border-radius:8px;background:#c8a45e;color:#0a1628;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-weight:700;font-size:18px}
.r-brand-name{font-family:'Playfair Display',serif;font-size:20px;font-weight:700;letter-spacing:.5px}
.r-doc-title{font-family:'Playfair Display',serif;font-size:18px;font-weight:600;color:#c8a45e;letter-spacing:1px;text-transform:uppercase}
.r-doc-period{font-size:11px;color:rgba(255,255,255,.65);margin-top:2px;letter-spacing:.5px}
.r-cover{padding:28px 32px 8px}
.r-cover-row{display:flex;gap:32px;flex-wrap:wrap;align-items:flex-start}
.r-cover-meta{flex:1;min-width:0}
.r-cover-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#9ca3af;font-weight:600}
.r-cover-name{font-size:22px;font-weight:700;color:#0a1628;margin-top:4px;line-height:1.25}
.r-cover-company{font-size:14px;color:#6b7280;margin-top:2px}
.r-cover-period{font-size:12px;color:#6b7280;margin-top:6px;font-weight:500}
.r-cover-image{width:200px;max-width:35%;aspect-ratio:16/10;border-radius:8px;background:#f3f4f6;object-fit:cover}
.r-summary{padding:20px 32px 4px}
.r-summary p{font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap}
.r-rule{height:1px;background:linear-gradient(90deg,transparent,#d1d5db,transparent);margin:24px 32px}
.r-section{padding:6px 32px 18px;page-break-inside:avoid}
.r-section-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.r-section-icon{font-size:22px;line-height:1}
.r-section-title{font-size:17px;font-weight:700;color:#0a1628;letter-spacing:.2px}
.r-section-body{font-size:13.5px;color:#374151;line-height:1.7;white-space:pre-wrap;margin-bottom:14px}
.r-metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}
.r-metric{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px}
.r-metric-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:600;margin-bottom:4px}
.r-metric-value{font-size:16px;font-weight:700;color:#0a1628;font-family:'Playfair Display',serif}
.r-items{margin-bottom:14px;padding-left:0;list-style:none}
.r-items li{padding:8px 0 8px 18px;border-bottom:1px solid #f3f4f6;position:relative;font-size:13px;color:#374151;line-height:1.6}
.r-items li:last-child{border-bottom:none}
.r-items li::before{content:'';position:absolute;left:0;top:16px;width:6px;height:6px;border-radius:50%;background:#c8a45e}
.r-items strong{color:#0a1628;font-weight:600}
.r-items .r-item-detail{display:block;font-size:12px;color:#6b7280;margin-top:2px}
.r-images{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:6px}
.r-image-card{border-radius:6px;overflow:hidden;border:1px solid #e5e7eb;background:#f9fafb}
.r-image-card img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block;background:#f3f4f6}
.r-image-caption{padding:6px 10px;font-size:11px;color:#6b7280;line-height:1.5}
.r-notes{padding:6px 32px 18px}
.r-notes-box{background:#f9fafb;border:1px solid #e5e7eb;border-left:3px solid #c8a45e;border-radius:6px;padding:14px 18px}
.r-notes-box p{font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap}
.r-foot{padding:16px 32px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.r-foot-line{font-size:11px;color:#6b7280}
.r-foot-mark{font-size:10px;letter-spacing:1.5px;color:#9ca3af;text-transform:uppercase}
@page{size:A4;margin:12mm}
</style>
</head><body>
<div class="r-sheet">
  <div class="r-strip">
    <div class="r-brand">
      <div class="r-brand-mark">${esc(AGENCY.name.charAt(0))}</div>
      <div>
        <div class="r-brand-name">${esc(AGENCY.name)}</div>
        <div class="r-doc-period">${esc(AGENCY.tagline)}</div>
      </div>
    </div>
    <div style="text-align:right">
      <div class="r-doc-title">Weekly Report</div>
      <div class="r-doc-period">${esc(report.report_number)}</div>
    </div>
  </div>

  <div class="r-cover">
    <div class="r-cover-row">
      <div class="r-cover-meta">
        <div class="r-cover-label">Prepared for</div>
        <div class="r-cover-name">${esc(customerName)}</div>
        ${report.customer_company ? `<div class="r-cover-company">${esc(report.customer_company)}</div>` : ''}
        <div class="r-cover-period">${esc(rangeLabel(report.period_start, report.period_end))} · Issued ${fmtDate(report.issue_date)}</div>
      </div>
      ${report.cover_image_url ? `<img src="${esc(report.cover_image_url)}" class="r-cover-image" alt="">` : ''}
    </div>
  </div>

  ${report.summary ? `<div class="r-summary"><p>${esc(report.summary)}</p></div>` : ''}

  ${sectionsHtml ? `<div class="r-rule"></div>${sectionsHtml}` : ''}

  ${report.notes ? `
    <div class="r-rule"></div>
    <div class="r-notes"><div class="r-notes-box"><p>${esc(report.notes)}</p></div></div>
  ` : ''}

  <div class="r-foot">
    <div class="r-foot-line">📍 ${esc(AGENCY.address)} · 📞 ${esc(AGENCY.phone)} · ✉ ${esc(AGENCY.email)}</div>
    <div class="r-foot-mark">${esc(AGENCY.name)} Agency</div>
  </div>
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
