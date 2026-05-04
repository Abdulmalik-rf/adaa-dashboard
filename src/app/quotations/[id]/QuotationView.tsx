'use client'

// In-app quotation viewer. Mirrors the design system from
// Emergize_Quotation_Generator.html — Archivo Black + Lilita One headlines,
// black/lime/purple palette, decorative SVG shapes, solid green grand-total
// row, dark footer with green top stripe. Data props unchanged so existing
// rows render with no migration.

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

function fmtDate(val: string | null, long = false) {
  if (!val) return '—'
  const d = new Date(val + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: long ? 'long' : 'short',
    year: 'numeric',
  })
}

export default function QuotationView({ q, items }: { q: Quotation; items: Item[] }) {
  const sortedItems = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const compact = sortedItems.length > 5

  const subtotal = sortedItems.reduce((sum, it) => {
    if (it.pricing_mode === 'percentage') return sum
    return sum + Number(it.qty ?? 1) * Number(it.unit_price ?? 0)
  }, 0)
  const vatRate = Number(q.vat_rate ?? 15)
  const vat = Math.round((subtotal * vatRate) / 100)
  const total = subtotal + vat

  const clientFullName = q.client_name_ar || q.client_name_en || '—'
  const showSecondaryName = !!(q.client_name_ar && q.client_name_en)

  return (
    <div className="quotation-wrap">
      <div className="toolbar">
        <a href="/quotations" className="back-link">← Back to quotations</a>
        <span className="quote-status" data-status={q.status}>{q.status}</span>
        <button className="print-btn" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className={`quotation-page${compact ? ' compact' : ''}`}>
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
        <div className="deco-dots">
          <div /><div /><div /><div />
        </div>

        {/* Header */}
        <div className="q-header">
          <div className="q-header-content">
            <div className="q-brand-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="q-logo-img"
                src="/emergize-logo.png"
                alt="Emergize"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            </div>
            <div className="q-doc-meta">
              <div className="q-doc-meta-label">Valid Until</div>
              <div className="q-doc-meta-value">{fmtDate(q.valid_until, true)}</div>
            </div>
          </div>
        </div>

        {/* Hero */}
        <div className="q-hero">
          <div className="q-hero-title">
            QUO<span className="accent-green">T</span>ATION<span className="accent-green">!</span>
          </div>
          <div className="q-hero-sub">
            A FORMAL PRICE ESTIMATE PREPARED EXCLUSIVELY FOR YOU.
            REVIEW THE DETAILS BELOW AND LET&apos;S BUILD SOMETHING GREAT TOGETHER.
          </div>
        </div>

        {/* Pills */}
        <div className="q-pills">
          <div className="pill pill-purple"><span className="dot"></span><span>{q.quote_number}</span></div>
          <div className="pill pill-dark">Issued · {fmtDate(q.issue_date)}</div>
          <div className="pill pill-green">Valid · {fmtDate(q.valid_until)}</div>
          {q.company_vat && <div className="pill pill-white">VAT&nbsp;<strong>{q.company_vat}</strong></div>}
          {q.company_cr && <div className="pill pill-white">C.R.&nbsp;<strong>{q.company_cr}</strong></div>}
        </div>

        {/* Body */}
        <div className="q-body">
          <div className="q-body-inner">
            {/* Parties */}
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
                <div className="q-party-name">{clientFullName}</div>
                {q.client_company && <div className="q-client-company">{q.client_company}</div>}
                <div className="q-party-detail">
                  {showSecondaryName && <>👤 {q.client_name_en}<br /></>}
                  {q.client_vat && <>VAT: {q.client_vat}<br /></>}
                  {q.client_cr && <>C.R.: {q.client_cr}</>}
                </div>
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="q-table-bar">
                <h3>Services &amp; Deliverables</h3>
                <span>{sortedItems.length} {sortedItems.length === 1 ? 'ITEM' : 'ITEMS'}</span>
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
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#888', padding: 28 }}>No items yet — ask the agent to add some.</td></tr>
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
                            <td className="r" style={{ color: '#7BA82A', fontWeight: 800 }}>
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

            {/* Notes + Totals */}
            <div className="q-mid-row">
              {q.notes && (
                <div style={{ flex: 1 }}>
                  <div className="q-section-title">Notes</div>
                  <div className="q-notes-box"><p>{q.notes}</p></div>
                </div>
              )}
              <div className="q-totals">
                <div className="q-totals-box">
                  <div className="q-total-line"><span className="tl">Subtotal</span><span className="tv">{fmt(subtotal)} SAR</span></div>
                  <div className="q-total-line"><span className="tl">VAT ({vatRate}%)</span><span className="tv">{fmt(vat)} SAR</span></div>
                  <div className="q-total-line grand"><span className="tl">Total</span><span className="tv">{fmt(total)} SAR</span></div>
                </div>
              </div>
            </div>

            {/* Terms */}
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
        </div>

        {/* Footer */}
        <div className="q-footer">
          <div className="q-footer-content">
            <div className="q-footer-info">
              <div className="q-footer-item">📍 {q.company_address}</div>
              <div className="q-footer-item">📞 {q.company_phone}</div>
              <div className="q-footer-item">✉ {q.company_email}</div>
            </div>
            <div className="q-footer-tag">Emerge · To · Dominate</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(body) { background: #0a0a0a; }
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
        .back-link {
          color: #9DCD3D;
          text-decoration: none;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
          margin-right: auto;
          text-transform: uppercase;
        }
        .back-link:hover { text-decoration: underline; }
        .quote-status {
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
        .quote-status[data-status='accepted'] { background: rgba(157, 205, 61, 0.2); color: #9DCD3D; border-color: rgba(157, 205, 61, 0.4); }
        .quote-status[data-status='rejected'] { background: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
        .quote-status[data-status='paid'] { background: rgba(91, 75, 255, 0.18); color: #7A6CFF; border-color: rgba(91, 75, 255, 0.4); }
        .print-btn {
          background: #9DCD3D;
          color: #0a0a0a;
          border: none;
          padding: 11px 20px;
          border-radius: 50px;
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.5px;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(157, 205, 61, 0.25);
          transition: all 0.2s;
        }
        .print-btn:hover {
          transform: translateY(-1px);
          background: #B5DC5C;
          box-shadow: 0 6px 20px rgba(157, 205, 61, 0.4);
        }

        /* ===== QUOTATION PAGE ===== */
        .quotation-page {
          --d: 1;
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
          bottom: 280px;
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
        .deco-dots {
          position: absolute;
          bottom: 90px;
          right: 50px;
          display: flex;
          gap: 5px;
          pointer-events: none;
          z-index: 1;
        }
        .deco-dots div { width: 8px; height: 8px; border-radius: 50%; background: #0a0a0a; }

        /* Header */
        .q-header { padding: calc(36px * var(--d)) 50px calc(28px * var(--d)); position: relative; z-index: 2; }
        .q-header-content { display: flex; justify-content: space-between; align-items: flex-start; }
        .q-brand-logo { display: flex; flex-direction: column; gap: 4px; }
        .q-logo-img { width: 240px; height: auto; max-height: 60px; object-fit: contain; display: block; }
        .q-doc-meta { text-align: right; }
        .q-doc-meta-label { font-size: 10px; color: #555; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; }
        .q-doc-meta-value { font-family: 'Archivo Black', sans-serif; font-size: 16px; color: #0a0a0a; letter-spacing: 0.5px; margin-top: 4px; line-height: 1.2; }

        /* Hero */
        .q-hero { padding: calc(26px * var(--d)) 50px calc(26px * var(--d)); position: relative; z-index: 2; }
        .q-hero-title {
          font-family: 'Lilita One', 'Archivo Black', sans-serif;
          font-size: 96px;
          line-height: 0.9;
          color: #0a0a0a;
          letter-spacing: -1px;
          text-transform: uppercase;
          margin-bottom: calc(14px * var(--d));
        }
        .q-hero-title .accent-green { color: #7BA82A; }
        .q-hero-sub {
          font-size: 13px;
          color: #555;
          letter-spacing: 1px;
          max-width: 480px;
          line-height: 1.5;
          font-weight: 500;
        }

        /* Pills */
        .q-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          padding: 0 50px calc(28px * var(--d));
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
        .q-body { flex: 1; min-height: 0; position: relative; z-index: 2; }
        .q-body-inner { padding: 0 50px calc(30px * var(--d)); }

        /* Parties */
        .q-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: calc(28px * var(--d)); }
        .q-party { padding: calc(22px * var(--d)) 24px; border-radius: 16px; position: relative; border: 1.5px solid #e5e5e5; }
        .q-party.from { background: #f5f5f5; border-color: #0a0a0a; }
        .q-party.to { background: rgba(157, 205, 61, 0.12); border-color: #9DCD3D; }
        .q-party-badge {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 3px;
          text-transform: uppercase;
          padding: 5px 14px;
          border-radius: 50px;
          display: inline-block;
          margin-bottom: calc(10px * var(--d));
          font-family: 'Inter', sans-serif;
        }
        .q-party.from .q-party-badge { background: #5B4BFF; color: #fff; }
        .q-party.to .q-party-badge { background: #9DCD3D; color: #0a0a0a; }
        .q-party-name { font-family: 'Archivo Black', sans-serif; font-size: 18px; color: #0a0a0a; margin: calc(4px * var(--d)) 0 calc(10px * var(--d)); letter-spacing: -0.3px; }
        .q-party-detail { font-size: 12px; color: #555; line-height: 1.8; }
        .q-client-company {
          display: inline-block;
          font-family: 'Archivo Black', sans-serif;
          font-size: 12px;
          color: #0a0a0a;
          background: #9DCD3D;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          padding: 5px 12px;
          border-radius: 50px;
          margin: calc(2px * var(--d)) 0 calc(8px * var(--d));
        }

        /* Table */
        .q-table-bar {
          background: #0a0a0a;
          padding: calc(14px * var(--d)) 24px;
          border-radius: 12px 12px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .q-table-bar :global(h3) {
          font-family: 'Archivo Black', sans-serif;
          font-size: 13px;
          color: #9DCD3D;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        .q-table-bar :global(span) {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 700;
          letter-spacing: 1px;
        }

        .q-table { width: 100%; border-collapse: collapse; background: #fff; color: #1a1a1a; margin-bottom: calc(22px * var(--d)); border: 1px solid #e5e5e5; border-top: none; }
        .q-table :global(thead th) {
          background: #f5f5f5;
          padding: calc(12px * var(--d)) 16px;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: #555;
          text-align: left;
          border-bottom: 2px solid #e5e5e5;
        }
        .q-table :global(thead th.r) { text-align: right; }
        .q-table :global(tbody td) {
          padding: calc(14px * var(--d)) 16px;
          font-size: 13px;
          color: #1a1a1a;
          border-bottom: 1px solid #e5e5e5;
          vertical-align: top;
        }
        .q-table :global(tbody td:first-child) {
          font-family: 'Archivo Black', sans-serif;
          color: #7BA82A;
          width: 40px;
          text-align: center;
        }
        .q-table :global(tbody td.r) { text-align: right; font-weight: 700; white-space: nowrap; }
        .q-item-name { font-weight: 800; color: #0a0a0a; margin-bottom: calc(4px * var(--d)); font-size: 14px; }
        .q-item-desc { font-size: 11.5px; color: #555; line-height: 1.6; }

        /* Mid row + totals */
        .q-mid-row { display: flex; gap: 24px; align-items: flex-start; margin-bottom: calc(28px * var(--d)); }
        .q-totals { display: flex; justify-content: flex-end; margin-left: auto; }
        .q-totals-box { width: 300px; border-radius: 16px; overflow: hidden; border: 1.5px solid #0a0a0a; }
        .q-total-line {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: calc(13px * var(--d)) 22px;
          font-size: 13px;
          background: #fff;
          border-bottom: 1px solid #e5e5e5;
        }
        .q-total-line .tl { color: #555; font-weight: 600; letter-spacing: 0.5px; }
        .q-total-line .tv { font-weight: 800; color: #0a0a0a; }
        .q-total-line.grand { background: #9DCD3D; border: none; padding: calc(17px * var(--d)) 22px; }
        .q-total-line.grand .tl {
          font-family: 'Archivo Black', sans-serif;
          color: #0a0a0a;
          font-size: 12px;
          letter-spacing: 2.5px;
          text-transform: uppercase;
        }
        .q-total-line.grand .tv {
          font-family: 'Archivo Black', sans-serif;
          color: #0a0a0a;
          font-size: 22px;
          letter-spacing: -0.5px;
        }

        /* Section title */
        .q-section-title {
          font-family: 'Archivo Black', sans-serif;
          font-size: 14px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #0a0a0a;
          margin-bottom: calc(12px * var(--d));
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .q-section-title::before { content: ''; width: 14px; height: 14px; background: #9DCD3D; border-radius: 50%; }
        .q-section-title::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, #e5e5e5, transparent); }

        /* Terms */
        .q-terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: calc(28px * var(--d)); }
        .q-term {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: calc(16px * var(--d)) 18px;
          background: #f5f5f5;
          border-radius: 14px;
          border: 1.5px solid #e5e5e5;
        }
        .q-term-num {
          width: 36px;
          height: 36px;
          min-width: 36px;
          background: #5B4BFF;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Archivo Black', sans-serif;
          font-size: 14px;
          color: #fff;
        }
        .q-term:nth-child(2) .q-term-num { background: #9DCD3D; color: #0a0a0a; }
        .q-term-pct {
          font-family: 'Archivo Black', sans-serif;
          font-size: 20px;
          color: #0a0a0a;
          margin-bottom: calc(4px * var(--d));
          letter-spacing: -0.3px;
        }
        .q-term-desc { font-size: 11.5px; color: #555; line-height: 1.6; }

        /* Notes */
        .q-notes-box { background: #f5f5f5; border: 1.5px solid #e5e5e5; border-radius: 14px; padding: calc(16px * var(--d)) 18px; }
        .q-notes-box :global(p) { font-size: 12px; color: #555; line-height: 1.7; }

        /* Footer */
        .q-footer {
          background: #141414;
          padding: 22px 50px;
          position: relative;
          margin-top: auto;
          z-index: 2;
          border-top: 2px solid #9DCD3D;
        }
        .q-footer-content { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
        .q-footer-info { display: flex; flex-wrap: wrap; gap: 22px; }
        .q-footer-item { font-size: 11px; color: #cccccc; letter-spacing: 0.3px; }
        .q-footer-tag {
          font-family: 'Archivo Black', sans-serif;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #9DCD3D;
        }

        /* Compact mode for many items */
        .quotation-page.compact { --d: 0.85; }
        .quotation-page.compact .q-hero-title { font-size: 72px; }
        .quotation-page.compact .q-table :global(tbody td) { padding: 10px 14px; font-size: 12px; }
        .quotation-page.compact .q-item-desc { font-size: 10.5px; line-height: 1.45; }
        .quotation-page.compact .q-totals-box { width: 270px; }
        .quotation-page.compact .q-total-line.grand .tv { font-size: 19px; }

        @media print {
          /* Force backgrounds + gradients to print regardless of the
             user's "Background graphics" checkbox. Without this, the
             black table-bar, dark footer, green grand-total row, and
             coloured pills all turn white in the PDF. */
          :global(*),
          :global(*::before),
          :global(*::after) {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          :global(html), :global(body) { background: #fff !important; }
          .toolbar { display: none !important; }
          .quotation-page {
            box-shadow: none;
            width: 210mm;
            min-height: 297mm;
            margin: 0;
          }
          .q-table :global(tbody tr), .q-totals-box, .q-term,
          .q-notes-box, .q-party { page-break-inside: avoid; break-inside: avoid; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  )
}
