'use client'

// Printable A4 quotation layout, ported from the user's CBL_Quotation_Generator.html
// but with two layout upgrades:
//   1. `compact` class auto-applied when there are > 5 items — reduces cell
//      padding, font-size, and section margins so 10-15 items still fit on
//      one A4 page without squashing the header/footer.
//   2. `page-break-inside: avoid` on rows, totals, terms, notes so if content
//      truly overflows onto a second printed page, things don't split mid-row.
//
// Styling is embedded via styled-jsx to keep this page self-contained (doesn't
// pollute the rest of the dashboard's Tailwind).

type Item = {
  id: string
  name: string
  description: string | null
  pricing_mode: 'fixed' | 'percentage'
  qty: number | null
  unit_price: number | null
  percentage: number | null
  position: number | null
}

type Quotation = {
  id: string
  quote_number: string
  client_name_ar: string | null
  client_name_en: string | null
  client_company: string | null
  client_vat: string | null
  client_cr: string | null
  company_name: string
  company_tagline: string
  company_phone: string
  company_address: string
  company_email: string
  company_vat: string
  company_cr: string
  issue_date: string
  valid_until: string | null
  vat_rate: number
  term1_pct: string
  term1_desc: string
  term2_pct: string
  term2_desc: string
  notes: string | null
  status: string
}

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

function fmtDate(val: string | null) {
  if (!val) return '—'
  const d = new Date(val + 'T00:00:00')
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function QuotationView({ q, items }: { q: Quotation; items: Item[] }) {
  const sortedItems = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const compact = sortedItems.length > 5

  const subtotal = sortedItems.reduce((sum, it) => {
    if (it.pricing_mode === 'percentage') return sum
    return sum + (Number(it.qty ?? 1) * Number(it.unit_price ?? 0))
  }, 0)
  const vatRate = Number(q.vat_rate ?? 15)
  const vat = Math.round((subtotal * vatRate) / 100)
  const total = subtotal + vat

  return (
    <div className="quotation-wrap">
      <div className="toolbar">
        <a href="/quotations" className="back-link">← Back to quotations</a>
        <span className="quote-status" data-status={q.status}>{q.status}</span>
        <button className="print-btn" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
      </div>

      <div className={`quotation-page ${compact ? 'compact' : ''}`}>
        <div className="q-watermark">{q.company_name}</div>

        <div className="q-header">
          <div className="q-header-content">
            <div>
              <div className="q-brand-logo">
                <div className="q-logo-icon">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/adaa-logo.jpg" alt="Company Logo" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                </div>
                <div className="q-brand-name">{q.company_name}</div>
              </div>
              <div className="q-brand-tagline">{q.company_tagline}</div>
            </div>
            <div>
              <div className="q-doc-title">Quotation</div>
              <div className="q-doc-subtitle">Official Price Estimate</div>
            </div>
          </div>
        </div>

        <div className="q-info-strip">
          <div className="q-info-item">
            <div className="q-info-label">Date Issued</div>
            <div className="q-info-value">{fmtDate(q.issue_date)}</div>
          </div>
          <div className="q-info-item">
            <div className="q-info-label">Valid Until</div>
            <div className="q-info-value">{fmtDate(q.valid_until)}</div>
          </div>
          <div className="q-info-item">
            <div className="q-info-label">Quote #</div>
            <div className="q-info-value">{q.quote_number}</div>
          </div>
        </div>

        <div className="q-vat-strip">
          <div className="q-vat-item">VAT No. <strong>{q.company_vat}</strong></div>
          <div className="q-vat-item">C.R. No. <strong>{q.company_cr}</strong></div>
        </div>

        <div className="q-body">
          <div className="q-parties">
            <div className="q-party from">
              <div className="q-party-badge">From</div>
              <div className="q-party-name">{q.company_name}</div>
              <div className="q-party-detail">
                📍 {q.company_address}<br />
                📞 {q.company_phone}<br />
                ✉ {q.company_email}
              </div>
            </div>
            <div className="q-party to">
              <div className="q-party-badge">Bill To</div>
              <div className="q-party-name">{q.client_name_ar || q.client_name_en || '—'}</div>
              <div className="q-party-detail">
                {q.client_name_en && <>👤 {q.client_name_en}<br /></>}
                {q.client_company && <>🏢 {q.client_company}<br /></>}
                {q.client_vat && <>VAT: {q.client_vat}<br /></>}
                {q.client_cr && <>C.R.: {q.client_cr}</>}
              </div>
            </div>
          </div>

          <div>
            <div className="q-table-bar">
              <h3>Services &amp; Deliverables</h3>
              <span>{sortedItems.length} {sortedItems.length === 1 ? 'Item' : 'Items'}</span>
            </div>
            <table className="q-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>#</th>
                  <th>Description</th>
                  <th className="r" style={{ width: 50 }}>Qty</th>
                  <th className="r" style={{ width: 110 }}>Unit Price</th>
                  <th className="r" style={{ width: 110 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa5b8', padding: 24 }}>No items yet — ask the agent to add some.</td></tr>
                ) : (
                  sortedItems.map((item, i) => {
                    if (item.pricing_mode === 'percentage') {
                      return (
                        <tr key={item.id}>
                          <td>{String(i + 1).padStart(2, '0')}</td>
                          <td>
                            <div className="q-item-name">{item.name || '—'}</div>
                            {item.description && <div className="q-item-desc">{item.description}</div>}
                          </td>
                          <td className="r">—</td>
                          <td className="r">—</td>
                          <td className="r" style={{ color: '#a6863a', fontWeight: 700 }}>
                            {item.percentage}% of profit
                          </td>
                        </tr>
                      )
                    }
                    const qty = Number(item.qty ?? 1)
                    const price = Number(item.unit_price ?? 0)
                    return (
                      <tr key={item.id}>
                        <td>{String(i + 1).padStart(2, '0')}</td>
                        <td>
                          <div className="q-item-name">{item.name || '—'}</div>
                          {item.description && <div className="q-item-desc">{item.description}</div>}
                        </td>
                        <td className="r">{qty}</td>
                        <td className="r">{fmt(price)} SAR</td>
                        <td className="r">{fmt(qty * price)} SAR</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="q-mid-row">
            {q.notes && (
              <div style={{ flex: 1 }}>
                <div className="q-section-title">Notes</div>
                <div className="q-notes-box"><p>{q.notes}</p></div>
              </div>
            )}
            <div className="q-totals" style={q.notes ? { marginLeft: 'auto' } : { marginLeft: 'auto' }}>
              <div className="q-totals-box">
                <div className="q-total-line"><span className="tl">Subtotal</span><span className="tv">{fmt(subtotal)} SAR</span></div>
                <div className="q-total-line"><span className="tl">VAT ({vatRate}%)</span><span className="tv">{fmt(vat)} SAR</span></div>
                <div className="q-total-line grand"><span className="tl">Total</span><span className="tv">{fmt(total)} SAR</span></div>
              </div>
            </div>
          </div>

          <div>
            <div className="q-section-title">Payment Terms</div>
            <div className="q-terms-grid">
              <div className="q-term">
                <div className="q-term-num">1</div>
                <div>
                  <div className="q-term-pct">{q.term1_pct}</div>
                  <div className="q-term-desc">{q.term1_desc}</div>
                </div>
              </div>
              <div className="q-term">
                <div className="q-term-num">2</div>
                <div>
                  <div className="q-term-pct">{q.term2_pct}</div>
                  <div className="q-term-desc">{q.term2_desc}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="q-footer">
          <div className="q-footer-content">
            <div className="q-footer-info">
              <div className="q-footer-item">📍 {q.company_address}</div>
              <div className="q-footer-item">📞 {q.company_phone}</div>
              <div className="q-footer-item">✉ {q.company_email}</div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(body) { background: #1a1a2e; }
        .quotation-wrap {
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
        .back-link { color: #c8a45e; text-decoration: none; font-size: 13px; font-weight: 600; margin-right: auto; }
        .back-link:hover { text-decoration: underline; }
        .quote-status {
          text-transform: uppercase;
          letter-spacing: 2px;
          font-size: 10px;
          font-weight: 700;
          padding: 4px 12px;
          border-radius: 20px;
          background: rgba(200,164,94,0.12);
          color: #c8a45e;
        }
        .quote-status[data-status="accepted"] { background: rgba(16,185,129,0.15); color: #10b981; }
        .quote-status[data-status="rejected"] { background: rgba(239,68,68,0.15); color: #ef4444; }
        .quote-status[data-status="paid"] { background: rgba(59,130,246,0.18); color: #60a5fa; }
        .print-btn {
          background: linear-gradient(135deg, #c8a45e, #a6863a);
          color: #0a1628;
          border: none;
          padding: 10px 18px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.5px;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(200,164,94,.2);
        }
        .print-btn:hover { transform: translateY(-1px); }

        .quotation-page {
          width: 794px;
          max-width: 100%;
          min-height: 1123px;
          background: #fff;
          color: #2d3748;
          position: relative;
          overflow: hidden;
          box-shadow: 0 25px 80px rgba(0,0,0,.4);
          display: flex;
          flex-direction: column;
        }
        .q-watermark {
          position: absolute; bottom: 120px; right: 30px;
          font-family: 'Playfair Display', serif;
          font-size: 140px; font-weight: 700;
          color: rgba(200,164,94,.03);
          pointer-events: none; user-select: none; line-height: 1;
        }
        .q-header {
          background: linear-gradient(135deg, #0a1628 0%, #132040 60%, #1a3060 100%);
          padding: 40px 50px 35px;
          position: relative;
          overflow: hidden;
        }
        .q-header::after {
          content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, #c8a45e, #e4c77b, #c8a45e);
        }
        .q-header-content { display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 1; }
        .q-brand-logo { display: flex; align-items: center; gap: 14px; }
        .q-logo-icon {
          width: 80px; height: 80px; background: #fff; padding: 5px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 12px; overflow: hidden;
          box-shadow: 0 4px 15px rgba(200,164,94,.3);
        }
        .q-logo-icon :global(img) { width: 100%; height: 100%; object-fit: contain; }
        .q-brand-name { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; color: #fff; letter-spacing: 1px; }
        .q-brand-tagline { font-size: 11px; color: #c8a45e; letter-spacing: 3px; text-transform: uppercase; font-weight: 500; margin-top: 6px; margin-left: 94px; }
        .q-doc-title { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 700; color: #c8a45e; letter-spacing: 2px; text-align: right; }
        .q-doc-subtitle { font-size: 11px; color: rgba(255,255,255,.5); letter-spacing: 4px; text-transform: uppercase; margin-top: 6px; text-align: right; }

        .q-info-strip { display: grid; grid-template-columns: 1fr 1fr 1fr; background: #f8f9fc; border-bottom: 1px solid #dde2ec; }
        .q-info-item { padding: 16px 24px; border-right: 1px solid #dde2ec; text-align: center; }
        .q-info-item:last-child { border-right: none; }
        .q-info-label { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #9aa5b8; font-weight: 600; margin-bottom: 4px; }
        .q-info-value { font-size: 14px; font-weight: 600; color: #0a1628; }

        .q-vat-strip { display: flex; justify-content: center; gap: 40px; padding: 10px 50px; background: rgba(200,164,94,.06); border-bottom: 1px solid rgba(200,164,94,.1); }
        .q-vat-item { font-size: 10px; color: #9aa5b8; letter-spacing: 1px; }
        .q-vat-item :global(strong) { color: #0a1628; font-weight: 600; }

        .q-body { padding: 35px 50px; flex: 1; }

        .q-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 35px; }
        .q-party { padding: 22px 24px; border-radius: 10px; position: relative; }
        .q-party.from { background: linear-gradient(135deg, rgba(10,22,40,.03), rgba(10,22,40,.06)); border: 1px solid rgba(10,22,40,.08); }
        .q-party.to { background: linear-gradient(135deg, rgba(200,164,94,.04), rgba(200,164,94,.08)); border: 1px solid rgba(200,164,94,.15); }
        .q-party-badge { position: absolute; top: -10px; left: 20px; font-size: 8px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; padding: 4px 14px; border-radius: 20px; }
        .q-party.from .q-party-badge { background: #0a1628; color: #c8a45e; }
        .q-party.to .q-party-badge { background: #c8a45e; color: #0a1628; }
        .q-party-name { font-size: 16px; font-weight: 700; color: #0a1628; margin: 6px 0 10px; }
        .q-party-detail { font-size: 12px; color: #5a6678; line-height: 1.8; }

        .q-table-bar { background: linear-gradient(135deg, #0a1628, #132040); padding: 12px 24px; border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center; }
        .q-table-bar :global(h3) { font-size: 12px; font-weight: 600; color: #c8a45e; letter-spacing: 2px; text-transform: uppercase; }
        .q-table-bar :global(span) { font-size: 10px; color: rgba(255,255,255,.5); }

        .q-table { width: 100%; border-collapse: collapse; border: 1px solid #dde2ec; border-top: none; margin-bottom: 24px; }
        .q-table :global(thead th) { background: #f8f9fc; padding: 12px 16px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #9aa5b8; text-align: left; border-bottom: 2px solid #dde2ec; }
        .q-table :global(thead th.r) { text-align: right; }
        .q-table :global(tbody td) { padding: 16px; font-size: 13px; color: #2d3748; border-bottom: 1px solid #eef1f6; vertical-align: top; }
        .q-table :global(tbody td:first-child) { font-weight: 700; color: #0a1628; width: 40px; text-align: center; }
        .q-table :global(tbody td.r) { text-align: right; font-weight: 600; white-space: nowrap; }
        .q-item-name { font-weight: 600; color: #0a1628; margin-bottom: 4px; }
        .q-item-desc { font-size: 11.5px; color: #5a6678; line-height: 1.6; }

        .q-mid-row { display: flex; gap: 40px; align-items: flex-start; margin-bottom: 30px; }
        .q-totals { display: flex; justify-content: flex-end; margin-bottom: 0; }
        .q-totals-box { width: 280px; border-radius: 10px; overflow: hidden; border: 1px solid #dde2ec; }
        .q-total-line { display: flex; justify-content: space-between; padding: 12px 20px; font-size: 13px; border-bottom: 1px solid #eef1f6; }
        .q-total-line .tl { color: #5a6678; font-weight: 500; }
        .q-total-line .tv { font-weight: 600; color: #2d3748; }
        .q-total-line.grand { background: linear-gradient(135deg, #0a1628, #132040); border: none; }
        .q-total-line.grand .tl { color: #c8a45e; font-weight: 700; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
        .q-total-line.grand .tv { color: #fff; font-size: 18px; font-weight: 800; }

        .q-section-title { font-size: 10px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: #0a1628; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
        .q-section-title::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, #dde2ec, transparent); }

        .q-terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 30px; }
        .q-term { display: flex; align-items: flex-start; gap: 14px; padding: 18px; background: #f8f9fc; border-radius: 10px; border: 1px solid #eef1f6; }
        .q-term-num { width: 32px; height: 32px; min-width: 32px; background: linear-gradient(135deg, #c8a45e, #a6863a); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; }
        .q-term-pct { font-size: 18px; font-weight: 800; color: #0a1628; margin-bottom: 2px; }
        .q-term-desc { font-size: 11.5px; color: #5a6678; line-height: 1.6; }

        .q-notes-box { background: #f8f9fc; border: 1px solid #eef1f6; border-radius: 10px; padding: 18px; margin-bottom: 20px; }
        .q-notes-box :global(p) { font-size: 12px; color: #5a6678; line-height: 1.7; }

        .q-footer { background: linear-gradient(135deg, #0a1628, #132040); padding: 24px 50px; position: relative; margin-top: auto; }
        .q-footer::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #c8a45e, #e4c77b, #c8a45e); }
        .q-footer-content { display: flex; justify-content: space-between; align-items: center; }
        .q-footer-info { display: flex; gap: 30px; }
        .q-footer-item { font-size: 11px; color: rgba(255,255,255,.6); }

        /* COMPACT mode — auto-applied when > 5 items. Keeps the A4 first page
           from running over by shrinking row padding, descriptions, and the
           party/body margins. */
        .quotation-page.compact .q-header { padding: 30px 50px 25px; }
        .quotation-page.compact .q-body { padding: 25px 45px; }
        .quotation-page.compact .q-parties { gap: 30px; margin-bottom: 22px; }
        .quotation-page.compact .q-party { padding: 16px 20px; }
        .quotation-page.compact .q-party-name { margin: 4px 0 6px; font-size: 15px; }
        .quotation-page.compact .q-party-detail { line-height: 1.55; font-size: 11.5px; }
        .quotation-page.compact .q-table :global(tbody td) { padding: 10px 12px; font-size: 12px; }
        .quotation-page.compact .q-item-desc { font-size: 10.5px; line-height: 1.45; }
        .quotation-page.compact .q-table { margin-bottom: 18px; }
        .quotation-page.compact .q-mid-row { gap: 30px; margin-bottom: 20px; }
        .quotation-page.compact .q-totals-box { width: 260px; }
        .quotation-page.compact .q-total-line { padding: 9px 16px; font-size: 12px; }
        .quotation-page.compact .q-total-line.grand .tv { font-size: 16px; }
        .quotation-page.compact .q-terms-grid { gap: 10px; margin-bottom: 20px; }
        .quotation-page.compact .q-term { padding: 12px 14px; gap: 10px; }
        .quotation-page.compact .q-term-num { width: 26px; height: 26px; min-width: 26px; font-size: 11px; }
        .quotation-page.compact .q-term-pct { font-size: 15px; }
        .quotation-page.compact .q-term-desc { font-size: 10.5px; }
        .quotation-page.compact .q-notes-box { padding: 12px 14px; margin-bottom: 14px; }
        .quotation-page.compact .q-footer { padding: 18px 50px; }

        @media print {
          :global(body) { background: #fff; }
          .toolbar { display: none !important; }
          .quotation-page { box-shadow: none; width: 100%; min-height: 100vh; }
          /* Don't split a single row, totals card, or term card across pages. */
          .q-table :global(tbody tr) { page-break-inside: avoid; }
          .q-totals-box, .q-term, .q-notes-box { page-break-inside: avoid; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  )
}
