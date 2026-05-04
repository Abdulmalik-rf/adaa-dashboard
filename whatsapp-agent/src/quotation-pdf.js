// Renders a single quotation to a PDF buffer, mirroring the in-app
// /quotations/[id] viewer 1:1 (Emergize editorial style — Lilita One hero,
// Archivo Black headlines, lime/purple/black palette, decorative SVGs,
// solid green grand-total). Launches a fresh headless Chromium per PDF
// (~1-2s on warm cache) so we don't keep a browser process around.
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
    throw new Error(
      'puppeteer is not installed — run `npm install` in whatsapp-agent/ to fetch it',
    )
  }
}

// Inline the logo as a data URL so puppeteer doesn't need filesystem/network
// access for it. Resolved once per process.
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

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US')
}

function fmtDate(val, long = false) {
  if (!val) return '—'
  const d = new Date(val + 'T00:00:00')
  if (isNaN(d)) return esc(val)
  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: long ? 'long' : 'short',
    year: 'numeric',
  })
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderItemsRows(items) {
  if (items.length === 0) {
    return `<tr><td colspan="5" style="text-align:center;color:#888;padding:28px">No items</td></tr>`
  }
  return items
    .map((item, i) => {
      const idx = String(i + 1).padStart(2, '0')
      const nameBlock = `<div class="q-item-name">${esc(item.name) || '—'}</div>${item.description ? `<div class="q-item-desc">${esc(item.description)}</div>` : ''}`
      if (item.pricing_mode === 'percentage') {
        return `<tr><td>${idx}</td><td>${nameBlock}</td><td class="r">—</td><td class="r">—</td><td class="r" style="color:#7BA82A;font-weight:800">${item.percentage}% of profit</td></tr>`
      }
      const qty = Number(item.qty ?? 1)
      const price = Number(item.unit_price ?? 0)
      return `<tr><td>${idx}</td><td>${nameBlock}</td><td class="r">${qty}</td><td class="r">${fmt(price)} SAR</td><td class="r">${fmt(qty * price)} SAR</td></tr>`
    })
    .join('')
}

function renderHtml(q, items) {
  const sorted = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const compact = sorted.length > 5

  const subtotal = sorted.reduce(
    (s, it) =>
      it.pricing_mode === 'percentage'
        ? s
        : s + Number(it.qty ?? 1) * Number(it.unit_price ?? 0),
    0,
  )
  const vatRate = Number(q.vat_rate ?? 15)
  const vat = Math.round((subtotal * vatRate) / 100)
  const total = subtotal + vat

  const clientFullName = q.client_name_ar || q.client_name_en || '—'
  const showSecondaryName = !!(q.client_name_ar && q.client_name_en)
  const logoUrl = getLogoDataUrl()

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(q.quote_number)} — ${esc(q.company_name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&family=Lilita+One&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#fff;color:#0a0a0a}
.q-page{--d:${compact ? '0.85' : '1'};width:210mm;min-height:297mm;background:#fff;position:relative;overflow:hidden;display:flex;flex-direction:column}
.deco-asterisk{position:absolute;top:130px;left:38px;width:40px;height:40px;color:#5B4BFF;pointer-events:none;z-index:1}
.deco-arrow{position:absolute;top:145px;right:280px;width:70px;height:70px;pointer-events:none;z-index:1}
.deco-blob{position:absolute;top:-50px;right:-50px;width:240px;height:240px;pointer-events:none;z-index:0;opacity:.85}
.deco-checks{position:absolute;bottom:280px;left:30px;display:grid;grid-template-columns:repeat(4,22px);grid-template-rows:repeat(3,22px);gap:4px;pointer-events:none;z-index:0}
.deco-checks div{background:#5B4BFF;opacity:.9}
.deco-checks div:nth-child(2),.deco-checks div:nth-child(5),.deco-checks div:nth-child(7),.deco-checks div:nth-child(10){background:transparent}
.deco-dots{position:absolute;bottom:90px;right:50px;display:flex;gap:5px;pointer-events:none;z-index:1}
.deco-dots div{width:8px;height:8px;border-radius:50%;background:#0a0a0a}

.q-header{padding:calc(36px*var(--d)) 50px calc(28px*var(--d));position:relative;z-index:2}
.q-header-content{display:flex;justify-content:space-between;align-items:flex-start}
.q-logo-img{width:240px;height:auto;max-height:60px;object-fit:contain;display:block}
.q-doc-meta{text-align:right}
.q-doc-meta-label{font-size:10px;color:#555;letter-spacing:2px;text-transform:uppercase;font-weight:700}
.q-doc-meta-value{font-family:'Archivo Black',sans-serif;font-size:16px;color:#0a0a0a;letter-spacing:.5px;margin-top:4px;line-height:1.2}

.q-hero{padding:calc(26px*var(--d)) 50px calc(26px*var(--d));position:relative;z-index:2}
.q-hero-title{font-family:'Lilita One','Archivo Black',sans-serif;font-size:${compact ? '72' : '96'}px;line-height:.9;color:#0a0a0a;letter-spacing:-1px;text-transform:uppercase;margin-bottom:calc(14px*var(--d))}
.q-hero-title .accent-green{color:#7BA82A}
.q-hero-sub{font-size:13px;color:#555;letter-spacing:1px;max-width:480px;line-height:1.5;font-weight:500}

.q-pills{display:flex;flex-wrap:wrap;gap:10px;padding:0 50px calc(28px*var(--d));position:relative;z-index:2}
.pill{padding:10px 22px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;display:inline-flex;align-items:center;gap:8px}
.pill-purple{background:#5B4BFF;color:#fff}
.pill-dark{background:#0a0a0a;color:#fff;border:1px solid #0a0a0a}
.pill-green{background:#9DCD3D;color:#0a0a0a}
.pill-white{background:#fff;color:#0a0a0a;border:1.5px solid #0a0a0a}
.pill .dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.5}

.q-body{flex:1;min-height:0;position:relative;z-index:2}
.q-body-inner{padding:0 50px calc(30px*var(--d))}

.q-parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:calc(28px*var(--d))}
.q-party{padding:calc(22px*var(--d)) 24px;border-radius:16px;position:relative;border:1.5px solid #e5e5e5}
.q-party.from{background:#f5f5f5;border-color:#0a0a0a}
.q-party.to{background:rgba(157,205,61,.12);border-color:#9DCD3D}
.q-party-badge{font-size:9px;font-weight:800;letter-spacing:3px;text-transform:uppercase;padding:5px 14px;border-radius:50px;display:inline-block;margin-bottom:calc(10px*var(--d))}
.q-party.from .q-party-badge{background:#5B4BFF;color:#fff}
.q-party.to .q-party-badge{background:#9DCD3D;color:#0a0a0a}
.q-party-name{font-family:'Archivo Black',sans-serif;font-size:18px;color:#0a0a0a;margin:calc(4px*var(--d)) 0 calc(10px*var(--d));letter-spacing:-.3px}
.q-party-detail{font-size:12px;color:#555;line-height:1.8}
.q-client-company{display:inline-block;font-family:'Archivo Black',sans-serif;font-size:12px;color:#0a0a0a;background:#9DCD3D;letter-spacing:1.5px;text-transform:uppercase;padding:5px 12px;border-radius:50px;margin:calc(2px*var(--d)) 0 calc(8px*var(--d))}

.q-table-bar{background:#0a0a0a;padding:calc(14px*var(--d)) 24px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center}
.q-table-bar h3{font-family:'Archivo Black',sans-serif;font-size:13px;color:#9DCD3D;letter-spacing:2px;text-transform:uppercase}
.q-table-bar span{font-size:10px;color:rgba(255,255,255,.6);font-weight:700;letter-spacing:1px}

.q-table{width:100%;border-collapse:collapse;background:#fff;color:#1a1a1a;margin-bottom:calc(22px*var(--d));border:1px solid #e5e5e5;border-top:none}
.q-table thead th{background:#f5f5f5;padding:calc(12px*var(--d)) 16px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#555;text-align:left;border-bottom:2px solid #e5e5e5}
.q-table thead th.r{text-align:right}
.q-table tbody td{padding:calc(14px*var(--d)) 16px;font-size:${compact ? '12' : '13'}px;color:#1a1a1a;border-bottom:1px solid #e5e5e5;vertical-align:top}
.q-table tbody td:first-child{font-family:'Archivo Black',sans-serif;color:#7BA82A;width:40px;text-align:center}
.q-table tbody td.r{text-align:right;font-weight:700;white-space:nowrap}
.q-item-name{font-weight:800;color:#0a0a0a;margin-bottom:calc(4px*var(--d));font-size:14px}
.q-item-desc{font-size:${compact ? '10.5' : '11.5'}px;color:#555;line-height:1.6}

.q-mid-row{display:flex;gap:24px;align-items:flex-start;margin-bottom:calc(28px*var(--d))}
.q-totals{display:flex;justify-content:flex-end;margin-left:auto}
.q-totals-box{width:${compact ? '270' : '300'}px;border-radius:16px;overflow:hidden;border:1.5px solid #0a0a0a}
.q-total-line{display:flex;justify-content:space-between;align-items:center;padding:calc(13px*var(--d)) 22px;font-size:13px;background:#fff;border-bottom:1px solid #e5e5e5}
.q-total-line .tl{color:#555;font-weight:600;letter-spacing:.5px}
.q-total-line .tv{font-weight:800;color:#0a0a0a}
.q-total-line.grand{background:#9DCD3D;border:none;padding:calc(17px*var(--d)) 22px}
.q-total-line.grand .tl{font-family:'Archivo Black',sans-serif;color:#0a0a0a;font-size:12px;letter-spacing:2.5px;text-transform:uppercase}
.q-total-line.grand .tv{font-family:'Archivo Black',sans-serif;color:#0a0a0a;font-size:${compact ? '19' : '22'}px;letter-spacing:-.5px}

.q-section-title{font-family:'Archivo Black',sans-serif;font-size:14px;letter-spacing:1.5px;text-transform:uppercase;color:#0a0a0a;margin-bottom:calc(12px*var(--d));display:flex;align-items:center;gap:12px}
.q-section-title::before{content:'';width:14px;height:14px;background:#9DCD3D;border-radius:50%}
.q-section-title::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#e5e5e5,transparent)}

.q-terms-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:calc(28px*var(--d))}
.q-term{display:flex;align-items:flex-start;gap:14px;padding:calc(16px*var(--d)) 18px;background:#f5f5f5;border-radius:14px;border:1.5px solid #e5e5e5}
.q-term-num{width:36px;height:36px;min-width:36px;background:#5B4BFF;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Archivo Black',sans-serif;font-size:14px;color:#fff}
.q-term:nth-child(2) .q-term-num{background:#9DCD3D;color:#0a0a0a}
.q-term-pct{font-family:'Archivo Black',sans-serif;font-size:20px;color:#0a0a0a;margin-bottom:calc(4px*var(--d));letter-spacing:-.3px}
.q-term-desc{font-size:11.5px;color:#555;line-height:1.6}

.q-notes-box{background:#f5f5f5;border:1.5px solid #e5e5e5;border-radius:14px;padding:calc(16px*var(--d)) 18px}
.q-notes-box p{font-size:12px;color:#555;line-height:1.7}

.q-footer{background:#141414;padding:22px 50px;position:relative;margin-top:auto;z-index:2;border-top:2px solid #9DCD3D}
.q-footer-content{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}
.q-footer-info{display:flex;flex-wrap:wrap;gap:22px}
.q-footer-item{font-size:11px;color:#cccccc;letter-spacing:.3px}
.q-footer-tag{font-family:'Archivo Black',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9DCD3D}

@page{size:A4;margin:0}
@media print{
  .q-table tbody tr,.q-totals-box,.q-term,.q-notes-box{page-break-inside:avoid}
}
</style>
</head><body>
<div class="q-page">
  <svg class="deco-blob" viewBox="0 0 200 200"><path fill="#9DCD3D" d="M44.4,-65.7C56.5,-58.2,64.5,-43.7,69.7,-28.7C74.9,-13.6,77.4,2,73.5,16.3C69.7,30.6,59.5,43.6,46.6,52.6C33.7,61.6,18.1,66.5,1.5,64.5C-15.2,62.5,-30.4,53.6,-43.5,43.4C-56.7,33.2,-67.7,21.8,-71.5,7.7C-75.3,-6.4,-72,-23.3,-63.1,-35.6C-54.3,-47.9,-39.8,-55.7,-25.6,-62.4C-11.4,-69.1,2.6,-74.7,16.6,-73.6C30.5,-72.5,32.4,-73.3,44.4,-65.7Z" transform="translate(100 100)" /></svg>
  <svg class="deco-asterisk" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L13.5 9.5L21 8L15 12L21 16L13.5 14.5L12 22L10.5 14.5L3 16L9 12L3 8L10.5 9.5L12 2Z" /></svg>
  <svg class="deco-arrow" viewBox="0 0 70 70"><path d="M15 55 L55 15 M55 15 L25 15 M55 15 L55 45" stroke="#9DCD3D" stroke-width="9" fill="none" stroke-linecap="square" /></svg>
  <div class="deco-checks"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
  <div class="deco-dots"><div></div><div></div><div></div><div></div></div>

  <div class="q-header">
    <div class="q-header-content">
      <div>${logoUrl ? `<img class="q-logo-img" src="${logoUrl}" alt="Emergize">` : `<div style="font-family:'Archivo Black',sans-serif;font-size:32px;color:#0a0a0a">${esc(q.company_name)}</div>`}</div>
      <div class="q-doc-meta">
        <div class="q-doc-meta-label">Valid Until</div>
        <div class="q-doc-meta-value">${fmtDate(q.valid_until, true)}</div>
      </div>
    </div>
  </div>

  <div class="q-hero">
    <div class="q-hero-title">QUO<span class="accent-green">T</span>ATION<span class="accent-green">!</span></div>
    <div class="q-hero-sub">A FORMAL PRICE ESTIMATE PREPARED EXCLUSIVELY FOR YOU. REVIEW THE DETAILS BELOW AND LET'S BUILD SOMETHING GREAT TOGETHER.</div>
  </div>

  <div class="q-pills">
    <div class="pill pill-purple"><span class="dot"></span><span>${esc(q.quote_number)}</span></div>
    <div class="pill pill-dark">Issued · ${fmtDate(q.issue_date)}</div>
    <div class="pill pill-green">Valid · ${fmtDate(q.valid_until)}</div>
    ${q.company_vat ? `<div class="pill pill-white">VAT&nbsp;<strong>${esc(q.company_vat)}</strong></div>` : ''}
    ${q.company_cr ? `<div class="pill pill-white">C.R.&nbsp;<strong>${esc(q.company_cr)}</strong></div>` : ''}
  </div>

  <div class="q-body"><div class="q-body-inner">
    <div class="q-parties">
      <div class="q-party from">
        <div class="q-party-badge">From</div>
        <div class="q-party-name">${esc(q.company_name)}</div>
        <div class="q-party-detail">📍 ${esc(q.company_address)}<br>📞 ${esc(q.company_phone)}<br>✉ ${esc(q.company_email)}</div>
      </div>
      <div class="q-party to">
        <div class="q-party-badge">Bill To</div>
        <div class="q-party-name">${esc(clientFullName)}</div>
        ${q.client_company ? `<div class="q-client-company">${esc(q.client_company)}</div>` : ''}
        <div class="q-party-detail">${[
          showSecondaryName ? `👤 ${esc(q.client_name_en)}` : '',
          q.client_vat ? `VAT: ${esc(q.client_vat)}` : '',
          q.client_cr ? `C.R.: ${esc(q.client_cr)}` : '',
        ].filter(Boolean).join('<br>') || '—'}</div>
      </div>
    </div>

    <div>
      <div class="q-table-bar"><h3>Services &amp; Deliverables</h3><span>${sorted.length} ${sorted.length === 1 ? 'ITEM' : 'ITEMS'}</span></div>
      <table class="q-table">
        <thead><tr><th style="width:40px;text-align:center">#</th><th>Description</th><th class="r" style="width:50px">Qty</th><th class="r" style="width:110px">Unit Price</th><th class="r" style="width:110px">Amount</th></tr></thead>
        <tbody>${renderItemsRows(sorted)}</tbody>
      </table>
    </div>

    <div class="q-mid-row">
      ${q.notes ? `<div style="flex:1"><div class="q-section-title">Notes</div><div class="q-notes-box"><p>${esc(q.notes)}</p></div></div>` : ''}
      <div class="q-totals">
        <div class="q-totals-box">
          <div class="q-total-line"><span class="tl">Subtotal</span><span class="tv">${fmt(subtotal)} SAR</span></div>
          <div class="q-total-line"><span class="tl">VAT (${vatRate}%)</span><span class="tv">${fmt(vat)} SAR</span></div>
          <div class="q-total-line grand"><span class="tl">Total</span><span class="tv">${fmt(total)} SAR</span></div>
        </div>
      </div>
    </div>

    <div>
      <div class="q-section-title">Payment Terms</div>
      <div class="q-terms-grid">
        <div class="q-term"><div class="q-term-num">1</div><div><div class="q-term-pct">${esc(q.term1_pct)}</div><div class="q-term-desc">${esc(q.term1_desc)}</div></div></div>
        <div class="q-term"><div class="q-term-num">2</div><div><div class="q-term-pct">${esc(q.term2_pct)}</div><div class="q-term-desc">${esc(q.term2_desc)}</div></div></div>
      </div>
    </div>
  </div></div>

  <div class="q-footer">
    <div class="q-footer-content">
      <div class="q-footer-info">
        <div class="q-footer-item">📍 ${esc(q.company_address)}</div>
        <div class="q-footer-item">📞 ${esc(q.company_phone)}</div>
        <div class="q-footer-item">✉ ${esc(q.company_email)}</div>
      </div>
      <div class="q-footer-tag">Emerge · To · Dominate</div>
    </div>
  </div>
</div>
</body></html>`
}

export async function generateQuotationPdf(q, items) {
  const puppeteer = await getPuppeteer()
  const html = renderHtml(q, items)
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 }).catch((err) => {
      console.error('[quotation-pdf] setContent warning:', err?.message ?? err)
    })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })
    return Buffer.from(pdf)
  } catch (err) {
    console.error('[quotation-pdf] FAILED:', err?.message ?? err)
    console.error(err?.stack)
    throw err
  } finally {
    try { await browser.close() } catch {}
  }
}
