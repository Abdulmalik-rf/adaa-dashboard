// Renders a weekly report row to a PDF buffer. Mirrors the in-app
// /reports/[id] viewer 1:1 (Emergize editorial style — Lilita One hero,
// Archivo Black headlines, lime/purple/black palette, decorative SVGs,
// dark footer with green stripe). Launches a fresh headless Chromium per
// PDF (~1-2s on a warm cache) so we don't keep a browser process around.
// Puppeteer is loaded lazily so the rest of the agent still works without it.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

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
  name: 'Emergize',
  tagline: 'Emerge to Dominate',
  phone: '+966 577 602 467',
  address: 'Saudi Arabia — Khobar',
  email: 'abdulmalikalrifaee@outlook.com',
}

let _logoDataUrl = null
function getLogoDataUrl() {
  if (_logoDataUrl !== null) return _logoDataUrl
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const path = resolve(here, '../../public/emergize-logo.png')
    const buf = readFileSync(path)
    _logoDataUrl = `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    _logoDataUrl = ''
  }
  return _logoDataUrl
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtDate(val, long = false) {
  if (!val) return '—'
  const d = new Date(val + (typeof val === 'string' && val.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d)) return esc(val)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric' })
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

  const items = (svc.items ?? []).map((i, idx) => `
    <li>
      <span class="r-item-num">${String(idx + 1).padStart(2, '0')}</span>
      <div>
        <strong>${esc(i.title)}</strong>
        ${i.detail ? `<div class="r-item-detail">${esc(i.detail)}</div>` : ''}
      </div>
    </li>`).join('')

  const images = (svc.images ?? []).map((i) => `
    <div class="r-image-card">
      <img src="${esc(i.url)}" alt="">
      ${i.caption ? `<div class="r-image-caption">${esc(i.caption)}</div>` : ''}
    </div>`).join('')

  return `
  <div class="r-service">
    <div class="r-service-bar">
      <h3><span class="r-service-icon">${esc(svc.icon || '⭐')}</span>${esc(svc.title)}</h3>
      <span>${esc((svc.kind || '').toUpperCase())}</span>
    </div>
    <div class="r-service-body">
      ${svc.body ? `<p class="r-service-narrative">${esc(svc.body)}</p>` : ''}
      ${metrics ? `<div class="r-metric-grid">${metrics}</div>` : ''}
      ${items ? `<ul class="r-items">${items}</ul>` : ''}
      ${images ? `<div class="r-images">${images}</div>` : ''}
    </div>
  </div>`
}

// Legacy renderer for old reports that pre-date the services-array model.
function renderLegacy(report) {
  const out = []
  const k = report.kpis ?? []
  const p = report.platforms ?? []
  const c = report.content_items ?? []
  const cm = report.campaigns ?? []
  const td = report.tasks_done ?? []
  const tp = report.tasks_plan ?? []

  const block = (icon, title, kind, body) => `
    <div class="r-service">
      <div class="r-service-bar">
        <h3><span class="r-service-icon">${icon}</span>${title}</h3>
        <span>${kind}</span>
      </div>
      <div class="r-service-body">${body}</div>
    </div>`

  if (k.length) {
    const cells = k.map((m) => `
      <div class="r-metric">
        <div class="r-metric-label">${esc(m.label)}</div>
        <div class="r-metric-value">${esc(m.value)}</div>
      </div>`).join('')
    out.push(block('📊', 'Performance Snapshot', 'KPIS', `<div class="r-metric-grid">${cells}</div>`))
  }
  if (p.length) {
    const rows = p.map((r, i) => `
      <li><span class="r-item-num">${String(i + 1).padStart(2, '0')}</span>
        <div><strong>${esc(r.platform)}</strong>
          <div class="r-item-detail">${esc(r.followers ?? '—')} followers · ${esc(r.posts_count ?? 0)} posts · ${esc(r.engagement_rate ?? '—')}% engagement</div>
        </div>
      </li>`).join('')
    out.push(block('📱', 'Social Media', 'PLATFORMS', `<ul class="r-items">${rows}</ul>`))
  }
  if (c.length) {
    const rows = c.map((r, i) => `
      <li><span class="r-item-num">${String(i + 1).padStart(2, '0')}</span>
        <div><strong>${esc(r.title)}</strong>
          <div class="r-item-detail">${esc(r.platform || '')}${r.content_type ? ' · ' + esc(r.content_type) : ''}${r.publish_date ? ' · ' + esc(r.publish_date) : ''}</div>
        </div>
      </li>`).join('')
    out.push(block('🎬', 'Content Delivered', 'CONTENT', `<ul class="r-items">${rows}</ul>`))
  }
  if (cm.length) {
    const rows = cm.map((r, i) => `
      <li><span class="r-item-num">${String(i + 1).padStart(2, '0')}</span>
        <div><strong>${esc(r.name)}</strong>
          <div class="r-item-detail">${esc(r.platform || '')}${r.objective ? ' · ' + esc(r.objective) : ''}${r.spend ? ' · ' + esc(r.spend) + ' ' + esc(r.currency || 'SAR') : ''}</div>
        </div>
      </li>`).join('')
    out.push(block('🎯', 'Active Campaigns', 'CAMPAIGNS', `<ul class="r-items">${rows}</ul>`))
  }
  if (td.length || tp.length) {
    const done = td.map((t, i) => `<li><span class="r-item-num">${String(i + 1).padStart(2, '0')}</span><div><strong>✓ ${esc(t.title)}</strong>${t.owner || t.date_label ? `<div class="r-item-detail">${[t.owner, t.date_label].filter(Boolean).map(esc).join(' · ')}</div>` : ''}</div></li>`).join('')
    const plan = tp.map((t, i) => `<li><span class="r-item-num">${String(i + 1).padStart(2, '0')}</span><div><strong>→ ${esc(t.title)}</strong>${t.owner || t.date_label ? `<div class="r-item-detail">${[t.owner, t.date_label].filter(Boolean).map(esc).join(' · ')}</div>` : ''}</div></li>`).join('')
    const body = `${done ? `<ul class="r-items">${done}</ul>` : ''}${plan ? `<ul class="r-items">${plan}</ul>` : ''}`
    out.push(block('📋', 'Tasks & Plan', 'TASKS', body))
  }
  return out.join('')
}

function renderHtml(report) {
  const services = Array.isArray(report.services) ? report.services : []
  const customerName = report.customer_name ?? report.client_name_snapshot ?? '—'
  const sectionsHtml = services.length
    ? services.map(renderServiceBlock).join('')
    : renderLegacy(report)
  const logoUrl = getLogoDataUrl()

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(report.report_number)} — ${esc(AGENCY.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&family=Lilita+One&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#fff;color:#0a0a0a}
.r-page{width:210mm;min-height:297mm;background:#fff;position:relative;overflow:hidden;display:flex;flex-direction:column}
.deco-asterisk{position:absolute;top:130px;left:38px;width:40px;height:40px;color:#5B4BFF;pointer-events:none;z-index:1}
.deco-arrow{position:absolute;top:145px;right:280px;width:70px;height:70px;pointer-events:none;z-index:1}
.deco-blob{position:absolute;top:-50px;right:-50px;width:240px;height:240px;pointer-events:none;z-index:0;opacity:.85}
.deco-checks{position:absolute;top:480px;left:30px;display:grid;grid-template-columns:repeat(4,22px);grid-template-rows:repeat(3,22px);gap:4px;pointer-events:none;z-index:0}
.deco-checks div{background:#5B4BFF;opacity:.9}
.deco-checks div:nth-child(2),.deco-checks div:nth-child(5),.deco-checks div:nth-child(7),.deco-checks div:nth-child(10){background:transparent}

.r-header{padding:20px 50px 28px 30px;position:relative;z-index:2}
.r-header-content{display:flex;justify-content:space-between;align-items:flex-start}
.r-logo-img{width:340px;height:auto;max-height:100px;object-fit:contain;display:block}
.r-doc-meta{text-align:right}
.r-doc-meta-label{font-size:10px;color:#555;letter-spacing:2px;text-transform:uppercase;font-weight:700}
.r-doc-meta-value{font-family:'Archivo Black',sans-serif;font-size:16px;color:#0a0a0a;letter-spacing:.5px;margin-top:4px;line-height:1.2}

.r-hero{padding:18px 50px 26px;position:relative;z-index:2}
.r-hero-title{font-family:'Lilita One','Archivo Black',sans-serif;font-size:88px;line-height:.9;color:#0a0a0a;letter-spacing:-1px;text-transform:uppercase;margin-bottom:14px}
.r-hero-title .accent-green{color:#7BA82A}
.r-hero-sub{font-size:13px;color:#555;letter-spacing:1px;max-width:480px;line-height:1.5;font-weight:500}

.r-pills{display:flex;flex-wrap:wrap;gap:10px;padding:0 50px 28px;position:relative;z-index:2}
.pill{padding:10px 22px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;display:inline-flex;align-items:center;gap:8px}
.pill-purple{background:#5B4BFF;color:#fff}
.pill-dark{background:#0a0a0a;color:#fff;border:1px solid #0a0a0a}
.pill-green{background:#9DCD3D;color:#0a0a0a}
.pill-white{background:#fff;color:#0a0a0a;border:1.5px solid #0a0a0a}
.pill .dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.5}

.r-body{flex:1;min-height:0;position:relative;z-index:2}
.r-body-inner{padding:0 50px 30px}

.r-parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}
.r-party{padding:22px 24px;border-radius:16px;position:relative;border:1.5px solid #e5e5e5}
.r-party.from{background:#f5f5f5;border-color:#0a0a0a}
.r-party.to{background:rgba(157,205,61,.12);border-color:#9DCD3D}
.r-party-badge{font-size:9px;font-weight:800;letter-spacing:3px;text-transform:uppercase;padding:5px 14px;border-radius:50px;display:inline-block;margin-bottom:10px}
.r-party.from .r-party-badge{background:#5B4BFF;color:#fff}
.r-party.to .r-party-badge{background:#9DCD3D;color:#0a0a0a}
.r-party-name{font-family:'Archivo Black',sans-serif;font-size:18px;color:#0a0a0a;margin:4px 0 10px;letter-spacing:-.3px}
.r-party-detail{font-size:12px;color:#555;line-height:1.8}
.r-client-company{display:inline-block;font-family:'Archivo Black',sans-serif;font-size:12px;color:#0a0a0a;background:#9DCD3D;letter-spacing:1.5px;text-transform:uppercase;padding:5px 12px;border-radius:50px;margin:2px 0 8px}

.r-cover-banner{margin-bottom:28px;border-radius:16px;overflow:hidden;border:1.5px solid #e5e5e5;aspect-ratio:16/8;background:#f5f5f5}
.r-cover-banner img{width:100%;height:100%;object-fit:cover;display:block}

.r-section-title{font-family:'Archivo Black',sans-serif;font-size:14px;letter-spacing:1.5px;text-transform:uppercase;color:#0a0a0a;margin-bottom:12px;display:flex;align-items:center;gap:12px}
.r-section-title::before{content:'';width:14px;height:14px;background:#9DCD3D;border-radius:50%;flex-shrink:0}
.r-section-title::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#e5e5e5,transparent)}

.r-summary-block,.r-notes-block{margin-bottom:28px}

.r-service{margin-bottom:28px;page-break-inside:avoid}
.r-service-bar{background:#0a0a0a;padding:14px 24px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center}
.r-service-bar h3{font-family:'Archivo Black',sans-serif;font-size:13px;color:#9DCD3D;letter-spacing:2px;text-transform:uppercase;display:flex;align-items:center;gap:10px}
.r-service-bar span{font-size:10px;color:rgba(255,255,255,.6);font-weight:700;letter-spacing:1px}
.r-service-icon{font-size:18px;line-height:1}
.r-service-body{background:#fff;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;padding:22px 24px}
.r-service-narrative{font-size:13.5px;color:#1a1a1a;line-height:1.7;white-space:pre-wrap;margin-bottom:18px}

.r-metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:18px}
.r-metric{background:rgba(157,205,61,.08);border:1.5px solid rgba(157,205,61,.3);border-radius:12px;padding:14px 16px;page-break-inside:avoid}
.r-metric-label{font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:6px}
.r-metric-value{font-family:'Archivo Black',sans-serif;font-size:22px;color:#0a0a0a;letter-spacing:-.3px;line-height:1.1}

.r-items{list-style:none;padding:0;margin:0 0 18px 0;display:flex;flex-direction:column;gap:8px}
.r-items li{display:flex;gap:14px;align-items:flex-start;padding:12px 14px;background:#f5f5f5;border:1px solid #e5e5e5;border-radius:10px}
.r-item-num{font-family:'Archivo Black',sans-serif;font-size:13px;color:#fff;background:#5B4BFF;min-width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.r-items li:nth-child(even) .r-item-num{background:#9DCD3D;color:#0a0a0a}
.r-items strong{font-family:'Archivo Black',sans-serif;color:#0a0a0a;font-size:13px;letter-spacing:-.2px}
.r-item-detail{font-size:11.5px;color:#555;line-height:1.6;margin-top:2px}

.r-images{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.r-image-card{border-radius:12px;overflow:hidden;border:1.5px solid #e5e5e5;background:#f5f5f5;page-break-inside:avoid}
.r-image-card img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block}
.r-image-caption{padding:8px 12px;font-size:11px;color:#555;line-height:1.5}

.r-notes-box{background:#f5f5f5;border:1.5px solid #e5e5e5;border-radius:14px;padding:16px 18px;page-break-inside:avoid}
.r-notes-box p{font-size:12.5px;color:#555;line-height:1.7;white-space:pre-wrap}

.r-empty{padding:40px 20px;text-align:center;color:#888;font-size:13px;background:#f5f5f5;border-radius:12px;border:1px dashed #e5e5e5}

.r-footer{background:#141414;padding:22px 50px;position:relative;margin-top:auto;z-index:2;border-top:2px solid #9DCD3D}
.r-footer-content{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}
.r-footer-info{display:flex;flex-wrap:wrap;gap:22px}
.r-footer-item{font-size:11px;color:#cccccc;letter-spacing:.3px}
.r-footer-tag{font-family:'Archivo Black',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9DCD3D}

@page{size:A4;margin:0}
</style>
</head><body>
<div class="r-page">
  <svg class="deco-blob" viewBox="0 0 200 200"><path fill="#9DCD3D" d="M44.4,-65.7C56.5,-58.2,64.5,-43.7,69.7,-28.7C74.9,-13.6,77.4,2,73.5,16.3C69.7,30.6,59.5,43.6,46.6,52.6C33.7,61.6,18.1,66.5,1.5,64.5C-15.2,62.5,-30.4,53.6,-43.5,43.4C-56.7,33.2,-67.7,21.8,-71.5,7.7C-75.3,-6.4,-72,-23.3,-63.1,-35.6C-54.3,-47.9,-39.8,-55.7,-25.6,-62.4C-11.4,-69.1,2.6,-74.7,16.6,-73.6C30.5,-72.5,32.4,-73.3,44.4,-65.7Z" transform="translate(100 100)" /></svg>
  <svg class="deco-asterisk" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L13.5 9.5L21 8L15 12L21 16L13.5 14.5L12 22L10.5 14.5L3 16L9 12L3 8L10.5 9.5L12 2Z" /></svg>
  <svg class="deco-arrow" viewBox="0 0 70 70"><path d="M15 55 L55 15 M55 15 L25 15 M55 15 L55 45" stroke="#9DCD3D" stroke-width="9" fill="none" stroke-linecap="square" /></svg>
  <div class="deco-checks"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>

  <div class="r-header">
    <div class="r-header-content">
      <div>${logoUrl ? `<img class="r-logo-img" src="${logoUrl}" alt="Emergize">` : `<div style="font-family:'Archivo Black',sans-serif;font-size:32px;color:#0a0a0a">${esc(AGENCY.name)}</div>`}</div>
      <div class="r-doc-meta">
        <div class="r-doc-meta-label">Reporting Period</div>
        <div class="r-doc-meta-value">${esc(rangeLabel(report.period_start, report.period_end))}</div>
      </div>
    </div>
  </div>

  <div class="r-hero">
    <div class="r-hero-title">WE<span class="accent-green">E</span>KLY<br>REPOR<span class="accent-green">T</span><span class="accent-green">!</span></div>
    <div class="r-hero-sub">A SUMMARY OF THIS PERIOD'S WORK PREPARED FOR YOU. METRICS, DELIVERABLES, AND WHAT'S NEXT — ALL IN ONE PLACE.</div>
  </div>

  <div class="r-pills">
    <div class="pill pill-purple"><span class="dot"></span><span>${esc(report.report_number)}</span></div>
    <div class="pill pill-dark">Issued · ${fmtDate(report.issue_date)}</div>
    <div class="pill pill-green">Period · ${esc(rangeLabel(report.period_start, report.period_end))}</div>
    ${report.status ? `<div class="pill pill-white">Status&nbsp;<strong>${esc(String(report.status).toUpperCase())}</strong></div>` : ''}
  </div>

  <div class="r-body"><div class="r-body-inner">
    <div class="r-parties">
      <div class="r-party from">
        <div class="r-party-badge">Prepared by</div>
        <div class="r-party-name">${esc(AGENCY.name)}</div>
        <div class="r-party-detail">📍 ${esc(AGENCY.address)}<br>📞 ${esc(AGENCY.phone)}<br>✉ ${esc(AGENCY.email)}</div>
      </div>
      <div class="r-party to">
        <div class="r-party-badge">Prepared for</div>
        <div class="r-party-name">${esc(customerName)}</div>
        ${report.customer_company ? `<div class="r-client-company">${esc(report.customer_company)}</div>` : ''}
        <div class="r-party-detail">Issued ${fmtDate(report.issue_date, true)}</div>
      </div>
    </div>

    ${report.cover_image_url ? `<div class="r-cover-banner"><img src="${esc(report.cover_image_url)}" alt=""></div>` : ''}

    ${report.summary ? `<div class="r-summary-block"><div class="r-section-title">Summary</div><div class="r-notes-box"><p>${esc(report.summary)}</p></div></div>` : ''}

    ${sectionsHtml ? sectionsHtml : (!report.summary ? `<div class="r-empty">No services recorded in this report.</div>` : '')}

    ${report.notes ? `<div class="r-notes-block"><div class="r-section-title">Notes</div><div class="r-notes-box"><p>${esc(report.notes)}</p></div></div>` : ''}
  </div></div>

  <div class="r-footer">
    <div class="r-footer-content">
      <div class="r-footer-info">
        <div class="r-footer-item">📍 ${esc(AGENCY.address)}</div>
        <div class="r-footer-item">📞 ${esc(AGENCY.phone)}</div>
        <div class="r-footer-item">✉ ${esc(AGENCY.email)}</div>
      </div>
      <div class="r-footer-tag">Emerge · To · Dominate</div>
    </div>
  </div>
</div>
</body></html>`
}

export async function generateWeeklyReportPdf(report) {
  const puppeteer = await getPuppeteer()
  const html = renderHtml(report)
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    // 'load' waits for window.load (DOMContentLoaded + all images either
    // loaded or errored), with a hard 15s timeout. 'networkidle0' would
    // hang indefinitely if a Supabase storage image is slow to fetch.
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 }).catch((err) => {
      console.error('[weekly-report-pdf] setContent warning:', err?.message ?? err)
    })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    })
    // Puppeteer 22+ returns Uint8Array, but baileys' sendMessage calls
    // .toString('base64') on the document — which only Buffer supports.
    // Wrap explicitly so the WhatsApp send doesn't fail with
    // "Cannot read properties of undefined (reading 'toString')".
    return Buffer.from(pdf)
  } catch (err) {
    console.error('[weekly-report-pdf] FAILED:', err?.message ?? err)
    console.error(err?.stack)
    throw err
  } finally {
    await browser.close()
  }
}
