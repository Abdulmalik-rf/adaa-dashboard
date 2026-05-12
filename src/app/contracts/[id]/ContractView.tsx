'use client'

// Bilingual (English + Arabic) services contract — drafted to match how
// KSA-based agencies typically structure their B2B service agreements:
//
//   • Logo + corporate header
//   • Title block with the contract number, both Gregorian and Hijri
//     dates, the standard "بسم الله الرحمن الرحيم" line
//   • Preamble (Whereas / حيث أن) clauses
//   • Parties block — First Party = service provider (Emergize),
//                     Second Party = client
//   • Articles 1‑11 in English with the Arabic mirror underneath each
//     clause heading so the file holds up under bilingual review
//   • Payment schedule table from contract_payments
//   • Dual-column signature block with stamp placeholders
//
// Visual language matches the Quotation and Weekly Report templates:
// Emergize logo, lime/black/purple accents, Archivo Black / Lilita One
// headlines. Document is multi-page friendly — print CSS lets the
// browser paginate naturally onto A4 sheets.

type Contract = {
  id: string
  client_id: string | null
  title: string | null
  contract_type: string | null
  start_date: string | null
  end_date: string | null
  renewal_date: string | null
  value: number | null
  currency: string | null
  payment_cycle: string | null
  status: string | null
  scope: string | null
  notes: string | null
  created_at: string
}

type Client = {
  id: string
  company_name: string | null
  full_name: string | null
  phone: string | null
  email: string | null
  city: string | null
  business_type: string | null
}

type Payment = {
  id: string
  amount: number | null
  due_date: string | null
  paid_date: string | null
  status: string | null
  method: string | null
  notes: string | null
  position: number | null
}

type Settings = {
  agency_name: string | null
  support_email: string | null
} | null

// Emergize defaults — the same numbers used on quotations + weekly
// reports. Pulled here so a missing agency_settings row never blanks out
// the document.
const EMERGIZE = {
  name_en: 'Emergize Marketing Services',
  name_ar: 'إمرجايز للخدمات التسويقية',
  legal_form_en: 'Sole Proprietorship',
  legal_form_ar: 'مؤسسة فردية',
  address_en: 'King Fahd Rd, Al-Khobar, Eastern Province, Kingdom of Saudi Arabia',
  address_ar: 'طريق الملك فهد، الخبر، المنطقة الشرقية، المملكة العربية السعودية',
  phone: '+966 53 000 0000',
  email: 'hello@emergize.sa',
  vat: '310000000003',
  cr: '2050000000',
  tagline: 'Emerge · To · Dominate',
}

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

function fmtDateLong(val: string | null) {
  if (!val) return '—'
  const d = new Date(val + (val.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtDateHijri(val: string | null) {
  if (!val) return '—'
  try {
    const d = new Date(val + (val.length === 10 ? 'T00:00:00' : ''))
    // ar-SA with islamic calendar → "٢١ شعبان ١٤٤٧ هـ"
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(d) + ' هـ'
  } catch {
    return '—'
  }
}

function diffMonths(start: string | null, end: string | null) {
  if (!start || !end) return null
  const a = new Date(start + 'T00:00:00')
  const b = new Date(end + 'T00:00:00')
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  return months
}

function paymentCycleLabel(cycle: string | null): { en: string; ar: string } {
  switch ((cycle ?? '').toLowerCase()) {
    case 'monthly': return { en: 'Monthly', ar: 'شهرياً' }
    case 'quarterly': return { en: 'Quarterly', ar: 'كل ثلاثة أشهر' }
    case 'biannual':
    case 'semi_annual':
    case 'semiannual': return { en: 'Semi-annual', ar: 'كل ستة أشهر' }
    case 'annual':
    case 'yearly': return { en: 'Annual', ar: 'سنوياً' }
    case 'one_time':
    case 'onetime': return { en: 'One-time payment', ar: 'دفعة واحدة' }
    case 'milestone': return { en: 'On milestones', ar: 'حسب المعالم' }
    default: return { en: cycle || 'As agreed', ar: 'حسب الاتفاق' }
  }
}

function contractTypeLabel(t: string | null): { en: string; ar: string } {
  switch ((t ?? '').toLowerCase()) {
    case 'retainer': return { en: 'Retainer Services Agreement', ar: 'عقد خدمات بأجر شهري' }
    case 'project': return { en: 'Project-based Services Agreement', ar: 'عقد خدمات قائم على مشروع' }
    case 'hourly': return { en: 'Hourly Services Agreement', ar: 'عقد خدمات بالساعة' }
    case 'performance': return { en: 'Performance-based Agreement', ar: 'عقد قائم على الأداء' }
    case 'service':
    default: return { en: 'Marketing Services Agreement', ar: 'عقد تقديم خدمات تسويقية' }
  }
}

export default function ContractView({
  contract: c,
  client,
  payments,
  settings,
}: {
  contract: Contract
  client: Client | null
  payments: Payment[]
  settings: Settings
}) {
  const agencyName = settings?.agency_name || EMERGIZE.name_en
  const agencyEmail = settings?.support_email || EMERGIZE.email
  const tLabel = contractTypeLabel(c.contract_type)
  const cyc = paymentCycleLabel(c.payment_cycle)
  const totalMonths = diffMonths(c.start_date, c.end_date)
  const totalValue = Number(c.value ?? 0)
  const currency = c.currency || 'SAR'
  const vatPortion = Math.round(totalValue * (15 / 115)) // assume value INCLUDES 15% VAT
  const netPortion = totalValue - vatPortion

  // Contract number — human-readable, deterministic per row.
  const contractNumber = `EM-${(c.created_at ?? '').slice(0, 10).replace(/-/g, '')}-${(c.id ?? '').slice(0, 6).toUpperCase()}`
  const today = new Date()
  const issueDate = today.toISOString().slice(0, 10)

  // Articles 1‑11. We render each with the heading bilingual, then the
  // English body, then the Arabic body. This is the cleanest legible
  // layout that still survives a print to A4.
  const clauses: Array<{
    en_title: string
    ar_title: string
    en_body: React.ReactNode
    ar_body: React.ReactNode
  }> = [
    {
      en_title: 'Article 1 — Subject of the Contract',
      ar_title: 'المادة الأولى — موضوع العقد',
      en_body: (
        <>
          The First Party undertakes to provide the Second Party with the marketing services
          described below {c.scope ? '(the "Scope of Work"):' : '. The Scope of Work covers the activities agreed upon by the Parties in writing prior to execution.'}
          {c.scope && (
            <div className="scope-box">{c.scope}</div>
          )}
          {!c.scope && c.notes && (
            <div className="scope-box">{c.notes}</div>
          )}
        </>
      ),
      ar_body: (
        <>
          يلتزم الطرف الأول بتقديم الخدمات التسويقية الموضحة أعلاه للطرف الثاني وفقاً لنطاق العمل
          المتفق عليه كتابياً بين الطرفين. ويعتبر نطاق العمل جزءاً لا يتجزأ من هذا العقد.
        </>
      ),
    },
    {
      en_title: 'Article 2 — Term of the Contract',
      ar_title: 'المادة الثانية — مدة العقد',
      en_body: (
        <>
          This Contract shall commence on <strong>{fmtDateLong(c.start_date)}</strong> and shall remain
          in effect until <strong>{fmtDateLong(c.end_date)}</strong>
          {totalMonths !== null ? ` (a total period of approximately ${totalMonths} month${totalMonths === 1 ? '' : 's'})` : ''}.
          The Contract is automatically considered expired upon the end date unless renewed in writing
          by both Parties at least fifteen (15) calendar days in advance.
        </>
      ),
      ar_body: (
        <>
          يبدأ سريان هذا العقد من تاريخ <strong>{fmtDateLong(c.start_date)}</strong> ويستمر حتى تاريخ
          <strong> {fmtDateLong(c.end_date)}</strong>
          {totalMonths !== null ? `، أي ما يقارب ${totalMonths} شهراً` : ''}.
          ويُعد العقد منتهياً تلقائياً عند انقضاء مدته ما لم يتفق الطرفان كتابياً على تجديده قبل ١٥ يوماً
          على الأقل من تاريخ انتهائه.
        </>
      ),
    },
    {
      en_title: 'Article 3 — Contract Value & Payment Terms',
      ar_title: 'المادة الثالثة — قيمة العقد وشروط السداد',
      en_body: (
        <>
          The total value of this Contract is <strong>{fmt(totalValue)} {currency}</strong> inclusive of
          the Value Added Tax of fifteen percent (15%) imposed under the laws of the Kingdom of Saudi Arabia.
          The net amount before VAT is {fmt(netPortion)} {currency}; the VAT amount is {fmt(vatPortion)} {currency}.
          Payment shall be made <strong>{cyc.en.toLowerCase()}</strong> via bank transfer to the account designated by the
          First Party, against a tax invoice issued in accordance with ZATCA regulations.
          Any delay in payment beyond fifteen (15) calendar days from the due date entitles the First Party
          to suspend the services without further notice.
        </>
      ),
      ar_body: (
        <>
          القيمة الإجمالية لهذا العقد هي <strong>{fmt(totalValue)} {currency === 'SAR' ? 'ريال سعودي' : currency}</strong> شاملةً
          ضريبة القيمة المضافة بنسبة ١٥٪ وفقاً للأنظمة المعمول بها في المملكة العربية السعودية. وتبلغ
          قيمة العقد قبل الضريبة {fmt(netPortion)} {currency === 'SAR' ? 'ريال سعودي' : currency}،
          وقيمة الضريبة المضافة {fmt(vatPortion)} {currency === 'SAR' ? 'ريال سعودي' : currency}.
          يتم السداد <strong>{cyc.ar}</strong> عن طريق التحويل البنكي إلى الحساب الذي يحدده الطرف الأول،
          مقابل فاتورة ضريبية صادرة وفقاً لأنظمة هيئة الزكاة والضريبة والجمارك (زاتكا).
          ويحق للطرف الأول إيقاف الخدمات دون إشعار مسبق في حال تأخر السداد لأكثر من ١٥ يوماً من تاريخ
          الاستحقاق.
        </>
      ),
    },
    {
      en_title: 'Article 4 — Obligations of the First Party',
      ar_title: 'المادة الرابعة — التزامات الطرف الأول',
      en_body: (
        <>
          The First Party shall (a) perform the agreed services with professional standards and the
          quality customary in the digital marketing industry; (b) assign qualified personnel to the
          account; (c) deliver periodic progress reports as agreed; (d) maintain the confidentiality of
          the Second Party&apos;s information; and (e) comply with all applicable laws of the Kingdom of
          Saudi Arabia.
        </>
      ),
      ar_body: (
        <>
          يلتزم الطرف الأول بـ (أ) تقديم الخدمات المتفق عليها بالمعايير المهنية المتعارف عليها في قطاع
          التسويق الرقمي؛ (ب) تخصيص كوادر مؤهلة لإدارة الحساب؛ (ج) تقديم تقارير دورية للطرف الثاني وفق
          ما يتم الاتفاق عليه؛ (د) الحفاظ على سرية معلومات الطرف الثاني؛ (هـ) الالتزام بكافة الأنظمة
          المعمول بها في المملكة العربية السعودية.
        </>
      ),
    },
    {
      en_title: 'Article 5 — Obligations of the Second Party',
      ar_title: 'المادة الخامسة — التزامات الطرف الثاني',
      en_body: (
        <>
          The Second Party shall (a) provide the First Party with all information, brand assets and
          access credentials necessary for the performance of the services; (b) review and respond to
          deliverables within a reasonable period not exceeding five (5) business days; (c) settle the
          agreed fees on the due dates; and (d) refrain from instructing any third party to provide the
          same services during the term of this Contract.
        </>
      ),
      ar_body: (
        <>
          يلتزم الطرف الثاني بـ (أ) تزويد الطرف الأول بكافة المعلومات والأصول الخاصة بالعلامة التجارية
          وبيانات الدخول اللازمة لتنفيذ الخدمات؛ (ب) مراجعة المخرجات والرد عليها خلال مدة معقولة لا
          تتجاوز خمسة أيام عمل؛ (ج) سداد الأتعاب المتفق عليها في مواعيد استحقاقها؛ (د) عدم تكليف طرف
          آخر بتقديم نفس الخدمات خلال مدة هذا العقد.
        </>
      ),
    },
    {
      en_title: 'Article 6 — Confidentiality',
      ar_title: 'المادة السادسة — السرية',
      en_body: (
        <>
          Each Party undertakes to maintain the confidentiality of all information, documents and data
          received from the other Party in connection with this Contract, and shall not disclose them
          to any third party without prior written consent, except as required by the laws of the
          Kingdom of Saudi Arabia. This obligation shall survive for two (2) years after the expiry of
          this Contract.
        </>
      ),
      ar_body: (
        <>
          يتعهد كل طرف بالمحافظة على سرية جميع المعلومات والمستندات والبيانات التي يحصل عليها من الطرف
          الآخر بموجب هذا العقد، وعدم إفشائها لأي طرف ثالث دون موافقة كتابية مسبقة، باستثناء ما تستلزمه
          الأنظمة المعمول بها في المملكة العربية السعودية. ويظل هذا الالتزام سارياً لمدة سنتين بعد
          انتهاء العقد.
        </>
      ),
    },
    {
      en_title: 'Article 7 — Intellectual Property',
      ar_title: 'المادة السابعة — الملكية الفكرية',
      en_body: (
        <>
          Upon full settlement of the contract value, all final deliverables produced specifically for
          the Second Party (creative assets, copy, designs) shall be transferred to the Second Party
          for use in connection with its business. Tools, templates, methodologies and pre-existing
          intellectual property of the First Party remain its exclusive property.
        </>
      ),
      ar_body: (
        <>
          عند سداد كامل قيمة العقد، تنتقل ملكية المخرجات النهائية التي تم إنتاجها خصيصاً للطرف الثاني
          (التصاميم، النصوص، المحتوى الإبداعي) إلى الطرف الثاني لاستخدامها في أعماله. أما الأدوات
          والقوالب والمنهجيات والملكية الفكرية السابقة للطرف الأول فتظل ملكاً خالصاً له.
        </>
      ),
    },
    {
      en_title: 'Article 8 — Force Majeure',
      ar_title: 'المادة الثامنة — القوة القاهرة',
      en_body: (
        <>
          Neither Party shall be liable for any delay or failure to perform its obligations under this
          Contract where such delay or failure is caused by a force majeure event, including but not
          limited to natural disasters, war, civil disturbance, government actions, or interruption of
          essential telecommunications services. The affected Party shall notify the other within seven
          (7) days of the occurrence.
        </>
      ),
      ar_body: (
        <>
          لا يُسأل أي من الطرفين عن أي تأخير أو إخفاق في تنفيذ التزاماته بموجب هذا العقد إذا كان ذلك
          ناتجاً عن قوة قاهرة، بما في ذلك على سبيل المثال لا الحصر الكوارث الطبيعية أو الحروب أو
          الاضطرابات أو الإجراءات الحكومية أو انقطاع خدمات الاتصالات الأساسية. ويلتزم الطرف المتضرر
          بإخطار الطرف الآخر خلال سبعة أيام من تاريخ وقوعها.
        </>
      ),
    },
    {
      en_title: 'Article 9 — Termination',
      ar_title: 'المادة التاسعة — إنهاء العقد',
      en_body: (
        <>
          This Contract may be terminated by either Party upon thirty (30) calendar days&apos; prior
          written notice. Either Party may terminate immediately in the event of a material breach by
          the other Party which is not remedied within fifteen (15) days of written notice. Upon
          termination, the Second Party shall pay for all services rendered up to the effective date
          of termination.
        </>
      ),
      ar_body: (
        <>
          يحق لأي من الطرفين إنهاء هذا العقد بإشعار كتابي مسبق مدته ثلاثون يوماً. كما يحق لأي طرف
          الإنهاء الفوري في حال الإخلال الجوهري من الطرف الآخر وعدم تداركه خلال خمسة عشر يوماً من
          الإخطار الكتابي. وفي حال الإنهاء، يلتزم الطرف الثاني بسداد قيمة جميع الخدمات المقدمة حتى
          تاريخ نفاذ الإنهاء.
        </>
      ),
    },
    {
      en_title: 'Article 10 — Governing Law & Dispute Resolution',
      ar_title: 'المادة العاشرة — القانون الواجب التطبيق وتسوية النزاعات',
      en_body: (
        <>
          This Contract shall be governed by and construed in accordance with the laws of the Kingdom
          of Saudi Arabia. The Parties shall first seek to resolve any dispute amicably. Should they
          fail to do so within thirty (30) days, the matter shall be referred to the competent
          commercial court in the Eastern Province / Riyadh, as applicable.
        </>
      ),
      ar_body: (
        <>
          يخضع هذا العقد لأنظمة المملكة العربية السعودية ويُفسَّر وفقاً لها. ويسعى الطرفان إلى تسوية
          أي نزاع ينشأ عنه بالطرق الودية، وفي حال تعذر ذلك خلال ثلاثين يوماً، يُحال النزاع إلى المحكمة
          التجارية المختصة في المنطقة الشرقية / الرياض حسب الاختصاص.
        </>
      ),
    },
    {
      en_title: 'Article 11 — General Provisions',
      ar_title: 'المادة الحادية عشرة — أحكام عامة',
      en_body: (
        <>
          This Contract has been executed in two original counterparts in Arabic and English, each
          Party retaining one. In the event of any discrepancy between the two versions, the Arabic
          version shall prevail. Any amendment to this Contract shall only be valid if executed in
          writing and signed by both Parties.
        </>
      ),
      ar_body: (
        <>
          حُرر هذا العقد من نسختين أصليتين باللغتين العربية والإنجليزية، يحتفظ كل طرف بنسخة منهما.
          وفي حال وجود أي اختلاف بين النسختين، يُعتمد النص العربي. ولا يُعتد بأي تعديل على هذا العقد
          إلا إذا تم كتابياً وبتوقيع الطرفين.
        </>
      ),
    },
  ]

  return (
    <div className="contract-wrap">
      {/* Toolbar (hidden in print) */}
      <div className="toolbar">
        <a href="/contracts" className="back-link">← Back to contracts</a>
        <span className="status-pill" data-status={c.status ?? 'unsigned'}>
          {c.status?.replace('_', ' ') ?? 'unsigned'}
        </span>
        <button className="print-btn" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <article className="contract-page">
        {/* --- HEADER ----------------------------------------------------------------- */}
        <header className="ct-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/emergize-logo.png"
            alt="Emergize"
            className="ct-logo"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
          <div className="ct-brand-meta">
            <div className="ct-brand-ar">{EMERGIZE.name_ar}</div>
            <div className="ct-brand-en">{agencyName}</div>
          </div>
        </header>

        {/* --- BISMILLAH + TITLE ----------------------------------------------------- */}
        <div className="ct-bismillah">بسم الله الرحمن الرحيم</div>

        <div className="ct-title-block">
          <div className="ct-title-en">{tLabel.en.toUpperCase()}</div>
          <div className="ct-title-ar">{tLabel.ar}</div>
          <div className="ct-title-line" />
          <div className="ct-title-sub">{c.title || 'Untitled Agreement'}</div>
        </div>

        {/* Pills row — contract no, dates */}
        <div className="ct-pills">
          <div className="pill pill-dark">№ {contractNumber}</div>
          <div className="pill pill-green">Issued · {fmtDateLong(issueDate)}</div>
          <div className="pill pill-purple">{fmtDateHijri(issueDate)}</div>
        </div>

        {/* --- PREAMBLE ------------------------------------------------------------ */}
        <section className="ct-preamble">
          <p>
            <strong>WHEREAS</strong> the First Party is a marketing services provider duly registered
            in the Kingdom of Saudi Arabia and possesses the expertise required to deliver the
            services described below;
          </p>
          <p>
            <strong>WHEREAS</strong> the Second Party wishes to engage the First Party to provide such
            services on the terms and conditions set out herein;
          </p>
          <p>
            <strong>NOW THEREFORE</strong>, in consideration of the mutual covenants set forth below,
            the Parties have agreed as follows:
          </p>
          <p className="ar-block">
            <strong>حيث إن</strong> الطرف الأول مؤسسة مرخصة لتقديم خدمات التسويق في المملكة العربية
            السعودية ولديه الخبرات اللازمة لتقديم الخدمات الموضحة أدناه؛
            <br />
            <strong>وحيث إن</strong> الطرف الثاني يرغب في التعاقد مع الطرف الأول لتقديم هذه الخدمات
            وفقاً للشروط والأحكام الواردة في هذا العقد؛
            <br />
            <strong>عليه فقد اتفق الطرفان</strong>، وهما بكامل الأهلية المعتبرة شرعاً ونظاماً، على ما يلي:
          </p>
        </section>

        {/* --- PARTIES ----------------------------------------------------------- */}
        <section className="ct-parties">
          <div className="ct-party first">
            <div className="ct-party-badge">First Party · الطرف الأول</div>
            <div className="ct-party-role">Service Provider · مقدم الخدمة</div>
            <div className="ct-party-name">{agencyName}</div>
            <div className="ct-party-name-ar">{EMERGIZE.name_ar}</div>
            <ul className="ct-party-detail">
              <li><span>Legal form / الشكل القانوني:</span> {EMERGIZE.legal_form_en} — {EMERGIZE.legal_form_ar}</li>
              <li><span>Address / العنوان:</span> {EMERGIZE.address_en}</li>
              <li><span>VAT / الرقم الضريبي:</span> {EMERGIZE.vat}</li>
              <li><span>C.R. / السجل التجاري:</span> {EMERGIZE.cr}</li>
              <li><span>Phone / الهاتف:</span> {EMERGIZE.phone}</li>
              <li><span>Email / البريد:</span> {agencyEmail}</li>
            </ul>
          </div>

          <div className="ct-party second">
            <div className="ct-party-badge">Second Party · الطرف الثاني</div>
            <div className="ct-party-role">Client · العميل</div>
            <div className="ct-party-name">{client?.company_name || '—'}</div>
            <ul className="ct-party-detail">
              <li><span>Representative / ممثل العميل:</span> {client?.full_name || '—'}</li>
              <li><span>Address / العنوان:</span> {client?.city || '—'}, Kingdom of Saudi Arabia</li>
              <li><span>Phone / الهاتف:</span> {client?.phone || '—'}</li>
              <li><span>Email / البريد:</span> {client?.email || '—'}</li>
              <li><span>Business / النشاط:</span> {client?.business_type || '—'}</li>
            </ul>
          </div>
        </section>

        {/* --- ARTICLES --------------------------------------------------------- */}
        <section className="ct-clauses">
          {clauses.map((cl, i) => (
            <article key={i} className="ct-clause">
              <header className="ct-clause-head">
                <div className="ct-clause-en">{cl.en_title}</div>
                <div className="ct-clause-ar">{cl.ar_title}</div>
              </header>
              <div className="ct-clause-body en">{cl.en_body}</div>
              <div className="ct-clause-body ar">{cl.ar_body}</div>
            </article>
          ))}
        </section>

        {/* --- PAYMENT SCHEDULE (only if filled) -------------------------------- */}
        {payments.length > 0 && (
          <section className="ct-schedule">
            <div className="ct-table-bar">
              <h3>Payment Schedule · جدول السداد</h3>
              <span>{payments.length} INSTALLMENT{payments.length === 1 ? '' : 'S'}</span>
            </div>
            <table className="ct-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Due Date / تاريخ الاستحقاق</th>
                  <th>Method / طريقة الدفع</th>
                  <th>Notes / ملاحظات</th>
                  <th className="r">Amount / المبلغ</th>
                  <th className="r">Status / الحالة</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={p.id}>
                    <td>{String(i + 1).padStart(2, '0')}</td>
                    <td>{fmtDateLong(p.due_date)}</td>
                    <td>{p.method || '—'}</td>
                    <td>{p.notes || '—'}</td>
                    <td className="r">{fmt(Number(p.amount ?? 0))} {currency}</td>
                    <td className="r">{(p.status || 'pending').toUpperCase()}</td>
                  </tr>
                ))}
                <tr className="ct-table-total">
                  <td colSpan={4}>TOTAL · الإجمالي</td>
                  <td className="r" colSpan={2}>
                    {fmt(payments.reduce((s, p) => s + Number(p.amount ?? 0), 0))} {currency}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {/* --- SIGNATURES -------------------------------------------------------- */}
        <section className="ct-signatures">
          <div className="sig-col">
            <div className="sig-head">First Party · الطرف الأول</div>
            <div className="sig-name">{agencyName}</div>
            <div className="sig-name-ar">{EMERGIZE.name_ar}</div>
            <div className="sig-row">
              <div className="sig-label">Name / الاسم:</div>
              <div className="sig-fill">_________________________________</div>
            </div>
            <div className="sig-row">
              <div className="sig-label">Position / الصفة:</div>
              <div className="sig-fill">_________________________________</div>
            </div>
            <div className="sig-row">
              <div className="sig-label">Signature / التوقيع:</div>
              <div className="sig-fill">_________________________________</div>
            </div>
            <div className="sig-row">
              <div className="sig-label">Date / التاريخ:</div>
              <div className="sig-fill">_________________________________</div>
            </div>
            <div className="sig-stamp">Stamp / الختم</div>
          </div>

          <div className="sig-col">
            <div className="sig-head">Second Party · الطرف الثاني</div>
            <div className="sig-name">{client?.company_name || '—'}</div>
            <div className="sig-row">
              <div className="sig-label">Name / الاسم:</div>
              <div className="sig-fill">_________________________________</div>
            </div>
            <div className="sig-row">
              <div className="sig-label">Position / الصفة:</div>
              <div className="sig-fill">_________________________________</div>
            </div>
            <div className="sig-row">
              <div className="sig-label">Signature / التوقيع:</div>
              <div className="sig-fill">_________________________________</div>
            </div>
            <div className="sig-row">
              <div className="sig-label">Date / التاريخ:</div>
              <div className="sig-fill">_________________________________</div>
            </div>
            <div className="sig-stamp">Stamp / الختم</div>
          </div>
        </section>

        {/* --- FOOTER ------------------------------------------------------------ */}
        <footer className="ct-footer">
          <div className="ct-footer-info">
            <span>📍 {EMERGIZE.address_en}</span>
            <span>📞 {EMERGIZE.phone}</span>
            <span>✉ {agencyEmail}</span>
          </div>
          <div className="ct-footer-tag">{EMERGIZE.tagline}</div>
        </footer>
      </article>

      {/* eslint-disable react/no-unknown-property */}
      <style jsx>{`
        :global(body) { background: #0a0a0a; }
        .contract-wrap {
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
        .status-pill {
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
        .status-pill[data-status='active'] { background: rgba(157,205,61,0.2); color: #9DCD3D; border-color: rgba(157,205,61,0.4); }
        .status-pill[data-status='expired'] { background: rgba(239,68,68,0.15); color: #ef4444; border-color: rgba(239,68,68,0.3); }
        .status-pill[data-status='ending_soon'] { background: rgba(245,158,11,0.15); color: #f59e0b; border-color: rgba(245,158,11,0.3); }
        .status-pill[data-status='renewed'] { background: rgba(91,75,255,0.18); color: #7A6CFF; border-color: rgba(91,75,255,0.4); }
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

        /* ========== DOCUMENT ========== */
        .contract-page {
          width: 794px;
          max-width: 100%;
          background: #ffffff;
          color: #0a0a0a;
          box-shadow: 0 25px 80px rgba(0, 0, 0, 0.4);
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 12.5px;
          line-height: 1.7;
          position: relative;
          padding: 40px 50px 0;
          overflow: hidden;
        }

        /* Top + bottom lime stripes — formal but recognisably Emergize */
        .contract-page::before,
        .contract-page::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          height: 6px;
          background: linear-gradient(90deg, #9DCD3D 0%, #5B4BFF 60%, #0a0a0a 100%);
        }
        .contract-page::before { top: 0; }
        .contract-page::after  { bottom: 0; }

        /* Header */
        .ct-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding-bottom: 22px;
          border-bottom: 1.5px solid #0a0a0a;
        }
        .ct-logo { width: 240px; max-width: 60%; height: auto; object-fit: contain; display: block; }
        .ct-brand-meta { text-align: right; }
        .ct-brand-ar {
          font-family: 'Lilita One', 'Cairo', 'Tahoma', serif;
          font-size: 20px;
          color: #0a0a0a;
          letter-spacing: 0.5px;
          direction: rtl;
        }
        .ct-brand-en {
          font-family: 'Archivo Black', sans-serif;
          font-size: 11px;
          color: #5B4BFF;
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-top: 4px;
        }

        /* Bismillah + title */
        .ct-bismillah {
          font-family: 'Lilita One', 'Cairo', serif;
          font-size: 22px;
          text-align: center;
          color: #0a0a0a;
          margin: 28px 0 8px;
          letter-spacing: 1px;
          direction: rtl;
        }

        .ct-title-block { text-align: center; margin-bottom: 28px; }
        .ct-title-en {
          font-family: 'Archivo Black', 'Lilita One', sans-serif;
          font-size: 32px;
          letter-spacing: -0.5px;
          color: #0a0a0a;
          line-height: 1.05;
        }
        .ct-title-ar {
          font-family: 'Lilita One', 'Cairo', serif;
          font-size: 20px;
          color: #5B4BFF;
          margin-top: 6px;
          direction: rtl;
        }
        .ct-title-line {
          width: 60px; height: 4px; background: #9DCD3D; margin: 14px auto 10px;
        }
        .ct-title-sub {
          font-size: 13px;
          color: #555;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        /* Pills row */
        .ct-pills {
          display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;
          margin-bottom: 26px;
        }
        .pill {
          padding: 8px 18px;
          border-radius: 50px;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          font-family: 'Inter', sans-serif;
        }
        .pill-dark   { background: #0a0a0a; color: #fff; }
        .pill-green  { background: #9DCD3D; color: #0a0a0a; }
        .pill-purple { background: #5B4BFF; color: #fff; direction: rtl; font-family: 'Lilita One', 'Cairo', serif; letter-spacing: 0.5px; }

        /* Preamble */
        .ct-preamble {
          background: #fafafa;
          border-left: 4px solid #9DCD3D;
          padding: 18px 22px;
          margin-bottom: 26px;
          border-radius: 0 12px 12px 0;
        }
        .ct-preamble :global(p) { margin: 0 0 8px; }
        .ct-preamble :global(p:last-child) { margin-bottom: 0; }
        .ct-preamble :global(strong) {
          font-family: 'Archivo Black', sans-serif;
          letter-spacing: 1px;
          color: #5B4BFF;
        }
        .ct-preamble .ar-block {
          direction: rtl;
          text-align: right;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px dashed #cfcfcf;
          font-family: 'Cairo', 'Tahoma', serif;
          font-size: 12.5px;
          line-height: 1.9;
        }

        /* Parties */
        .ct-parties {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 28px;
        }
        .ct-party {
          padding: 18px 20px;
          border-radius: 14px;
          border: 1.5px solid #e5e5e5;
          background: #fafafa;
          position: relative;
        }
        .ct-party.first  { border-color: #5B4BFF; background: rgba(91, 75, 255, 0.04); }
        .ct-party.second { border-color: #9DCD3D; background: rgba(157, 205, 61, 0.06); }
        .ct-party-badge {
          font-family: 'Archivo Black', sans-serif;
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #fff;
          padding: 5px 12px;
          border-radius: 50px;
          display: inline-block;
          margin-bottom: 8px;
        }
        .ct-party.first  .ct-party-badge { background: #5B4BFF; }
        .ct-party.second .ct-party-badge { background: #9DCD3D; color: #0a0a0a; }
        .ct-party-role { font-size: 10px; color: #777; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; }
        .ct-party-name {
          font-family: 'Archivo Black', sans-serif;
          font-size: 16px;
          color: #0a0a0a;
          margin-bottom: 2px;
        }
        .ct-party-name-ar {
          font-family: 'Lilita One', 'Cairo', serif;
          font-size: 16px;
          color: #5B4BFF;
          direction: rtl;
          margin-bottom: 10px;
        }
        .ct-party-detail { list-style: none; padding: 0; margin: 6px 0 0; font-size: 11.5px; line-height: 1.8; color: #444; }
        .ct-party-detail :global(li) { padding: 1px 0; }
        .ct-party-detail :global(li span) {
          font-weight: 700;
          color: #0a0a0a;
          letter-spacing: 0.3px;
          margin-right: 4px;
        }

        /* Clauses */
        .ct-clauses { margin-bottom: 28px; }
        .ct-clause {
          margin-bottom: 18px;
          padding-bottom: 16px;
          border-bottom: 1px dashed #d0d0d0;
        }
        .ct-clause:last-child { border-bottom: none; }
        .ct-clause-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 20px;
          margin-bottom: 8px;
          padding: 8px 14px;
          background: #0a0a0a;
          border-radius: 8px;
        }
        .ct-clause-en {
          font-family: 'Archivo Black', sans-serif;
          font-size: 12.5px;
          color: #9DCD3D;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }
        .ct-clause-ar {
          font-family: 'Lilita One', 'Cairo', serif;
          font-size: 14px;
          color: #fff;
          direction: rtl;
          letter-spacing: 0.5px;
        }
        .ct-clause-body {
          font-size: 12px;
          color: #2a2a2a;
          line-height: 1.75;
          padding: 8px 4px 0;
        }
        .ct-clause-body.en { text-align: justify; }
        .ct-clause-body.ar {
          direction: rtl;
          text-align: justify;
          font-family: 'Cairo', 'Tahoma', serif;
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px dotted #d6d6d6;
        }
        .ct-clause-body :global(strong) {
          font-family: 'Archivo Black', sans-serif;
          letter-spacing: 0.3px;
        }
        .ct-clause-body :global(.scope-box) {
          margin: 8px 0 4px;
          padding: 10px 14px;
          background: #fff;
          border: 1.5px solid #9DCD3D;
          border-radius: 10px;
          font-size: 12px;
          color: #1a1a1a;
          line-height: 1.7;
          white-space: pre-wrap;
        }

        /* Payment schedule */
        .ct-schedule { margin: 0 0 28px; }
        .ct-table-bar {
          background: #0a0a0a;
          padding: 12px 22px;
          border-radius: 12px 12px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .ct-table-bar :global(h3) {
          font-family: 'Archivo Black', sans-serif;
          font-size: 12px;
          color: #9DCD3D;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }
        .ct-table-bar :global(span) {
          font-size: 10px;
          color: rgba(255,255,255,0.65);
          font-weight: 700;
          letter-spacing: 1px;
        }
        .ct-table {
          width: 100%;
          border-collapse: collapse;
          background: #fff;
          border: 1px solid #e5e5e5;
          border-top: none;
          font-size: 11.5px;
        }
        .ct-table :global(thead th) {
          background: #f5f5f5;
          padding: 9px 12px;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #555;
          text-align: left;
          border-bottom: 2px solid #e5e5e5;
        }
        .ct-table :global(thead th.r) { text-align: right; }
        .ct-table :global(tbody td) {
          padding: 9px 12px;
          color: #1a1a1a;
          border-bottom: 1px solid #ececec;
        }
        .ct-table :global(tbody td.r) { text-align: right; font-weight: 700; }
        .ct-table :global(tbody td:first-child) {
          font-family: 'Archivo Black', sans-serif;
          color: #7BA82A;
          text-align: center;
        }
        .ct-table :global(tr.ct-table-total td) {
          background: #9DCD3D;
          color: #0a0a0a;
          font-family: 'Archivo Black', sans-serif;
          font-size: 12px;
          letter-spacing: 1.5px;
          padding: 12px;
        }

        /* Signatures */
        .ct-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          margin: 28px 0;
        }
        .sig-col {
          border: 1.5px solid #0a0a0a;
          border-radius: 14px;
          padding: 18px 20px;
          background: #fafafa;
        }
        .sig-head {
          font-family: 'Archivo Black', sans-serif;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #fff;
          background: #0a0a0a;
          padding: 6px 12px;
          border-radius: 50px;
          display: inline-block;
          margin-bottom: 10px;
        }
        .sig-name {
          font-family: 'Archivo Black', sans-serif;
          font-size: 14px;
          color: #0a0a0a;
          margin-bottom: 2px;
        }
        .sig-name-ar {
          font-family: 'Lilita One', 'Cairo', serif;
          font-size: 13px;
          color: #5B4BFF;
          direction: rtl;
          margin-bottom: 10px;
        }
        .sig-row { display: flex; gap: 8px; margin: 8px 0; align-items: baseline; font-size: 11.5px; }
        .sig-label { color: #444; min-width: 130px; }
        .sig-fill { flex: 1; color: #888; letter-spacing: 1px; }
        .sig-stamp {
          margin-top: 16px;
          padding: 16px 0;
          text-align: center;
          border: 2px dashed #c8c8c8;
          color: #aaa;
          font-size: 10.5px;
          letter-spacing: 4px;
          text-transform: uppercase;
          border-radius: 8px;
        }

        /* Footer */
        .ct-footer {
          margin: 12px -50px 0;
          background: #141414;
          padding: 14px 50px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 18px;
          border-top: 2px solid #9DCD3D;
        }
        .ct-footer-info { display: flex; gap: 22px; flex-wrap: wrap; font-size: 11px; color: #cccccc; }
        .ct-footer-tag {
          font-family: 'Archivo Black', sans-serif;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #9DCD3D;
        }

        /* Print ---------------------------------------------------------- */
        @media print {
          :global(*),
          :global(*::before),
          :global(*::after) {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          :global(html), :global(body) { background: #fff !important; }
          .toolbar { display: none !important; }
          .contract-page {
            box-shadow: none;
            width: 210mm;
            margin: 0;
            padding: 18mm 18mm 0;
          }
          .ct-footer { margin: 12px -18mm 0; padding: 12px 18mm; }
          .ct-clause, .ct-party, .sig-col, .ct-schedule, .ct-preamble {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  )
}
