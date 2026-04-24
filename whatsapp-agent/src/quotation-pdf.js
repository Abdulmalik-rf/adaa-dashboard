// Renders a single quotation to a PDF buffer, matching the dashboard's
// /quotations/[id] layout 1:1. Launches a fresh headless Chromium per PDF
// (takes ~1-2s on a warm cache) so we don't keep a browser process sitting
// around. Puppeteer is loaded lazily so the rest of the agent still works
// even if puppeteer isn't installed yet (useful on CI / fresh clones).

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

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US')
}

function fmtDate(val) {
  if (!val) return '—'
  const d = new Date(val + 'T00:00:00')
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderItemsRows(items) {
  if (items.length === 0) {
    return `<tr><td colspan="5" style="text-align:center;color:#9aa5b8;padding:24px">No items</td></tr>`
  }
  return items
    .map((item, i) => {
      const idx = String(i + 1).padStart(2, '0')
      const nameBlock = `<div class="q-item-name">${esc(item.name) || '—'}</div>${item.description ? `<div class="q-item-desc">${esc(item.description)}</div>` : ''}`
      if (item.pricing_mode === 'percentage') {
        return `<tr><td>${idx}</td><td>${nameBlock}</td><td class="r">—</td><td class="r">—</td><td class="r" style="color:#a6863a;font-weight:700">${item.percentage}% of profit</td></tr>`
      }
      const qty = Number(item.qty ?? 1)
      const price = Number(item.unit_price ?? 0)
      return `<tr><td>${idx}</td><td>${nameBlock}</td><td class="r">${qty}</td><td class="r">${fmt(price)} SAR</td><td class="r">${fmt(qty * price)} SAR</td></tr>`
    })
    .join('')
}

// Build the full self-contained HTML document for a quotation.
function renderHtml(q, items) {
  const sorted = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const compact = sorted.length > 5

  const subtotal = sorted.reduce((s, it) =>
    it.pricing_mode === 'percentage' ? s : s + Number(it.qty ?? 1) * Number(it.unit_price ?? 0), 0)
  const vatRate = Number(q.vat_rate ?? 15)
  const vat = Math.round((subtotal * vatRate) / 100)
  const total = subtotal + vat

  const clientLine2 = [
    q.client_name_en && `👤 ${esc(q.client_name_en)}`,
    q.client_company && `🏢 ${esc(q.client_company)}`,
    q.client_vat && `VAT: ${esc(q.client_vat)}`,
    q.client_cr && `C.R.: ${esc(q.client_cr)}`,
  ].filter(Boolean).join('<br>')

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(q.quote_number)} — ${esc(q.company_name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box }
body { font-family:'Inter',sans-serif; background:#fff; color:#2d3748 }
.q-page { width:210mm; min-height:297mm; position:relative; overflow:hidden; display:flex; flex-direction:column }
.q-watermark { position:absolute; bottom:120px; right:30px; font-family:'Playfair Display',serif; font-size:140px; font-weight:700; color:rgba(200,164,94,0.03); pointer-events:none; line-height:1 }
.q-header { background:linear-gradient(135deg,#0a1628 0%,#132040 60%,#1a3060 100%); padding:40px 50px 35px; position:relative; overflow:hidden }
.q-header::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; background:linear-gradient(90deg,#c8a45e,#e4c77b,#c8a45e) }
.q-header-content { display:flex; justify-content:space-between; align-items:flex-start; position:relative; z-index:1 }
.q-brand-logo { display:flex; align-items:center; gap:14px }
.q-logo-icon { width:80px; height:80px; background:#fff; padding:5px; display:flex; align-items:center; justify-content:center; border-radius:12px; overflow:hidden; box-shadow:0 4px 15px rgba(200,164,94,.3); font-family:'Playfair Display',serif; font-size:28px; font-weight:700; color:#0a1628 }
.q-brand-name { font-family:'Playfair Display',serif; font-size:28px; font-weight:700; color:#fff; letter-spacing:1px }
.q-brand-tagline { font-size:11px; color:#c8a45e; letter-spacing:3px; text-transform:uppercase; font-weight:500; margin-top:6px; margin-left:94px }
.q-doc-title { font-family:'Playfair Display',serif; font-size:36px; font-weight:700; color:#c8a45e; letter-spacing:2px; text-align:right }
.q-doc-subtitle { font-size:11px; color:rgba(255,255,255,.5); letter-spacing:4px; text-transform:uppercase; margin-top:6px; text-align:right }
.q-info-strip { display:grid; grid-template-columns:1fr 1fr 1fr; background:#f8f9fc; border-bottom:1px solid #dde2ec }
.q-info-item { padding:16px 24px; border-right:1px solid #dde2ec; text-align:center }
.q-info-item:last-child { border-right:none }
.q-info-label { font-size:9px; text-transform:uppercase; letter-spacing:2px; color:#9aa5b8; font-weight:600; margin-bottom:4px }
.q-info-value { font-size:14px; font-weight:600; color:#0a1628 }
.q-vat-strip { display:flex; justify-content:center; gap:40px; padding:10px 50px; background:rgba(200,164,94,.06); border-bottom:1px solid rgba(200,164,94,.1) }
.q-vat-item { font-size:10px; color:#9aa5b8; letter-spacing:1px }
.q-vat-item strong { color:#0a1628; font-weight:600 }
.q-body { padding:35px 50px; flex:1 }
.q-parties { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-bottom:35px }
.q-party { padding:22px 24px; border-radius:10px; position:relative }
.q-party.from { background:linear-gradient(135deg,rgba(10,22,40,.03),rgba(10,22,40,.06)); border:1px solid rgba(10,22,40,.08) }
.q-party.to { background:linear-gradient(135deg,rgba(200,164,94,.04),rgba(200,164,94,.08)); border:1px solid rgba(200,164,94,.15) }
.q-party-badge { position:absolute; top:-10px; left:20px; font-size:8px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; padding:4px 14px; border-radius:20px }
.q-party.from .q-party-badge { background:#0a1628; color:#c8a45e }
.q-party.to .q-party-badge { background:#c8a45e; color:#0a1628 }
.q-party-name { font-size:16px; font-weight:700; color:#0a1628; margin:6px 0 10px }
.q-party-detail { font-size:12px; color:#5a6678; line-height:1.8 }
.q-table-bar { background:linear-gradient(135deg,#0a1628,#132040); padding:12px 24px; border-radius:10px 10px 0 0; display:flex; justify-content:space-between; align-items:center }
.q-table-bar h3 { font-size:12px; font-weight:600; color:#c8a45e; letter-spacing:2px; text-transform:uppercase }
.q-table-bar span { font-size:10px; color:rgba(255,255,255,.5) }
.q-table { width:100%; border-collapse:collapse; border:1px solid #dde2ec; border-top:none; margin-bottom:24px }
.q-table thead th { background:#f8f9fc; padding:12px 16px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:#9aa5b8; text-align:left; border-bottom:2px solid #dde2ec }
.q-table thead th.r { text-align:right }
.q-table tbody td { padding:16px; font-size:13px; color:#2d3748; border-bottom:1px solid #eef1f6; vertical-align:top }
.q-table tbody td:first-child { font-weight:700; color:#0a1628; width:40px; text-align:center }
.q-table tbody td.r { text-align:right; font-weight:600; white-space:nowrap }
.q-item-name { font-weight:600; color:#0a1628; margin-bottom:4px }
.q-item-desc { font-size:11.5px; color:#5a6678; line-height:1.6 }
.q-mid-row { display:flex; gap:40px; align-items:flex-start; margin-bottom:30px }
.q-totals-box { width:280px; border-radius:10px; overflow:hidden; border:1px solid #dde2ec; margin-left:auto }
.q-total-line { display:flex; justify-content:space-between; padding:12px 20px; font-size:13px; border-bottom:1px solid #eef1f6 }
.q-total-line .tl { color:#5a6678; font-weight:500 }
.q-total-line .tv { font-weight:600; color:#2d3748 }
.q-total-line.grand { background:linear-gradient(135deg,#0a1628,#132040); border:none }
.q-total-line.grand .tl { color:#c8a45e; font-weight:700; font-size:12px; letter-spacing:2px; text-transform:uppercase }
.q-total-line.grand .tv { color:#fff; font-size:18px; font-weight:800 }
.q-section-title { font-size:10px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; color:#0a1628; margin-bottom:14px; display:flex; align-items:center; gap:10px }
.q-section-title::after { content:''; flex:1; height:1px; background:linear-gradient(90deg,#dde2ec,transparent) }
.q-terms-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:30px }
.q-term { display:flex; align-items:flex-start; gap:14px; padding:18px; background:#f8f9fc; border-radius:10px; border:1px solid #eef1f6 }
.q-term-num { width:32px; height:32px; min-width:32px; background:linear-gradient(135deg,#c8a45e,#a6863a); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:#fff }
.q-term-pct { font-size:18px; font-weight:800; color:#0a1628; margin-bottom:2px }
.q-term-desc { font-size:11.5px; color:#5a6678; line-height:1.6 }
.q-notes-box { background:#f8f9fc; border:1px solid #eef1f6; border-radius:10px; padding:18px; margin-bottom:20px }
.q-notes-box p { font-size:12px; color:#5a6678; line-height:1.7 }
.q-footer { background:linear-gradient(135deg,#0a1628,#132040); padding:24px 50px; position:relative; margin-top:auto }
.q-footer::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,#c8a45e,#e4c77b,#c8a45e) }
.q-footer-content { display:flex; justify-content:space-between; align-items:center }
.q-footer-info { display:flex; gap:30px }
.q-footer-item { font-size:11px; color:rgba(255,255,255,.6) }

/* Compact mode — same thresholds and shrinks as QuotationView.tsx */
.q-page.compact .q-header { padding:30px 50px 25px }
.q-page.compact .q-body { padding:25px 45px }
.q-page.compact .q-parties { gap:30px; margin-bottom:22px }
.q-page.compact .q-party { padding:16px 20px }
.q-page.compact .q-party-name { margin:4px 0 6px; font-size:15px }
.q-page.compact .q-party-detail { line-height:1.55; font-size:11.5px }
.q-page.compact .q-table tbody td { padding:10px 12px; font-size:12px }
.q-page.compact .q-item-desc { font-size:10.5px; line-height:1.45 }
.q-page.compact .q-table { margin-bottom:18px }
.q-page.compact .q-mid-row { gap:30px; margin-bottom:20px }
.q-page.compact .q-totals-box { width:260px }
.q-page.compact .q-total-line { padding:9px 16px; font-size:12px }
.q-page.compact .q-total-line.grand .tv { font-size:16px }
.q-page.compact .q-terms-grid { gap:10px; margin-bottom:20px }
.q-page.compact .q-term { padding:12px 14px; gap:10px }
.q-page.compact .q-term-num { width:26px; height:26px; min-width:26px; font-size:11px }
.q-page.compact .q-term-pct { font-size:15px }
.q-page.compact .q-term-desc { font-size:10.5px }
.q-page.compact .q-notes-box { padding:12px 14px; margin-bottom:14px }
.q-page.compact .q-footer { padding:18px 50px }

@page { size:A4; margin:0 }
@media print {
  .q-table tbody tr, .q-totals-box, .q-term, .q-notes-box { page-break-inside:avoid }
}
</style>
</head><body>
<div class="q-page${compact ? ' compact' : ''}">
  <div class="q-watermark">${esc(q.company_name)}</div>
  <div class="q-header"><div class="q-header-content">
    <div>
      <div class="q-brand-logo">
        <div class="q-logo-icon">${esc((q.company_name || 'A').charAt(0))}</div>
        <div class="q-brand-name">${esc(q.company_name)}</div>
      </div>
      <div class="q-brand-tagline">${esc(q.company_tagline)}</div>
    </div>
    <div>
      <div class="q-doc-title">Quotation</div>
      <div class="q-doc-subtitle">Official Price Estimate</div>
    </div>
  </div></div>
  <div class="q-info-strip">
    <div class="q-info-item"><div class="q-info-label">Date Issued</div><div class="q-info-value">${fmtDate(q.issue_date)}</div></div>
    <div class="q-info-item"><div class="q-info-label">Valid Until</div><div class="q-info-value">${fmtDate(q.valid_until)}</div></div>
    <div class="q-info-item"><div class="q-info-label">Quote #</div><div class="q-info-value">${esc(q.quote_number)}</div></div>
  </div>
  <div class="q-vat-strip">
    <div class="q-vat-item">VAT No. <strong>${esc(q.company_vat)}</strong></div>
    <div class="q-vat-item">C.R. No. <strong>${esc(q.company_cr)}</strong></div>
  </div>
  <div class="q-body">
    <div class="q-parties">
      <div class="q-party from">
        <div class="q-party-badge">From</div>
        <div class="q-party-name">${esc(q.company_name)}</div>
        <div class="q-party-detail">📍 ${esc(q.company_address)}<br>📞 ${esc(q.company_phone)}<br>✉ ${esc(q.company_email)}</div>
      </div>
      <div class="q-party to">
        <div class="q-party-badge">Bill To</div>
        <div class="q-party-name">${esc(q.client_name_ar || q.client_name_en || '—')}</div>
        <div class="q-party-detail">${clientLine2 || '—'}</div>
      </div>
    </div>
    <div>
      <div class="q-table-bar"><h3>Services &amp; Deliverables</h3><span>${sorted.length} ${sorted.length === 1 ? 'Item' : 'Items'}</span></div>
      <table class="q-table">
        <thead><tr>
          <th style="width:40px;text-align:center">#</th>
          <th>Description</th>
          <th class="r" style="width:50px">Qty</th>
          <th class="r" style="width:110px">Unit Price</th>
          <th class="r" style="width:110px">Amount</th>
        </tr></thead>
        <tbody>${renderItemsRows(sorted)}</tbody>
      </table>
    </div>
    <div class="q-mid-row">
      ${q.notes ? `<div style="flex:1"><div class="q-section-title">Notes</div><div class="q-notes-box" style="margin-bottom:0"><p>${esc(q.notes)}</p></div></div>` : ''}
      <div class="q-totals-box">
        <div class="q-total-line"><span class="tl">Subtotal</span><span class="tv">${fmt(subtotal)} SAR</span></div>
        <div class="q-total-line"><span class="tl">VAT (${vatRate}%)</span><span class="tv">${fmt(vat)} SAR</span></div>
        <div class="q-total-line grand"><span class="tl">Total</span><span class="tv">${fmt(total)} SAR</span></div>
      </div>
    </div>
    <div>
      <div class="q-section-title">Payment Terms</div>
      <div class="q-terms-grid">
        <div class="q-term"><div class="q-term-num">1</div><div><div class="q-term-pct">${esc(q.term1_pct)}</div><div class="q-term-desc">${esc(q.term1_desc)}</div></div></div>
        <div class="q-term"><div class="q-term-num">2</div><div><div class="q-term-pct">${esc(q.term2_pct)}</div><div class="q-term-desc">${esc(q.term2_desc)}</div></div></div>
      </div>
    </div>
  </div>
  <div class="q-footer"><div class="q-footer-content"><div class="q-footer-info">
    <div class="q-footer-item">📍 ${esc(q.company_address)}</div>
    <div class="q-footer-item">📞 ${esc(q.company_phone)}</div>
    <div class="q-footer-item">✉ ${esc(q.company_email)}</div>
  </div></div></div>
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
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })
    return Buffer.from(pdf)
  } finally {
    try { await browser.close() } catch {}
  }
}
