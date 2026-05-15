import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { ArrowUpRight, UserPlus, Phone, Mail, MessageCircle, Sparkles, AlertCircle, Clock } from 'lucide-react'
import { LeadActions } from './LeadActions'

export const revalidate = 30

// Inline server-side i18n. Same pattern as /clients/page.tsx.
const T = {
  en: {
    pageTitle: 'Leads & Outreach',
    pageSub: 'Every prospect from business cards, referrals, and inbound — track contact status and convert when they\'re ready.',
    addLead: 'Add Lead',
    totalLeads: 'Total Leads',
    awaiting: 'Awaiting first contact',
    contactedToday: 'Contacted today',
    staleLeads: 'Stale (>14 days)',
    searchPlaceholder: 'Search by company, name, phone, email…',
    filterAll: 'All',
    filterNotContacted: 'Not contacted',
    filterContacted: 'Contacted',
    filterStale: 'Stale',
    colCompany: 'Company / Contact',
    colChannels: 'Reach Them',
    colLastContact: 'Last Touch',
    colStatus: 'Status',
    colActions: 'Quick Actions',
    statusToContact: 'To Contact',
    statusLead: 'Lead',
    noLeads: 'No leads here',
    noLeadsHint: 'Snap a business card via the WhatsApp agent or hit Add Lead to get the first prospect in.',
    rowHint: 'Click the row to open the full lead workspace',
    never: 'Never',
    daysAgo: 'd ago',
    hoursAgo: 'h ago',
    justNow: 'just now',
    contactWA: 'WhatsApp',
    contactEmail: 'Email',
    contactCall: 'Call',
    markContacted: 'Mark contacted',
    promote: 'Promote',
    promoteHint: 'Convert this lead into an active client',
    backLink: '← Back to clients',
    aboutToContact: 'These are people you scanned/saved but never reached out to yet.',
    aboutLead: 'These are people you\'ve had at least one touchpoint with — keep nurturing.',
  },
  ar: {
    pageTitle: 'العملاء المحتملون والمتابعة',
    pageSub: 'كل عميل محتمل من بطاقات الأعمال والإحالات والاستفسارات الواردة — تتبّع حالة التواصل وحوّلهم عندما يصبحون جاهزين.',
    addLead: 'إضافة محتمل',
    totalLeads: 'إجمالي المحتملين',
    awaiting: 'بانتظار التواصل الأول',
    contactedToday: 'تم التواصل اليوم',
    staleLeads: 'متأخرة (>١٤ يوم)',
    searchPlaceholder: 'ابحث بالشركة، الاسم، الجوال، البريد…',
    filterAll: 'الكل',
    filterNotContacted: 'لم يتم التواصل',
    filterContacted: 'تم التواصل',
    filterStale: 'متأخرة',
    colCompany: 'الشركة / المسؤول',
    colChannels: 'وسائل التواصل',
    colLastContact: 'آخر تواصل',
    colStatus: 'الحالة',
    colActions: 'إجراءات سريعة',
    statusToContact: 'للتواصل',
    statusLead: 'محتمل',
    noLeads: 'لا يوجد محتملون هنا',
    noLeadsHint: 'التقط صورة لبطاقة عمل عبر وكيل واتساب أو اضغط "إضافة محتمل" لإدخال أول عميل.',
    rowHint: 'اضغط على الصف لفتح ملف العميل المحتمل',
    never: 'لم يتم التواصل',
    daysAgo: 'يوم',
    hoursAgo: 'ساعة',
    justNow: 'للتو',
    contactWA: 'واتساب',
    contactEmail: 'بريد',
    contactCall: 'اتصال',
    markContacted: 'تم التواصل',
    promote: 'ترقية',
    promoteHint: 'حوّل هذا المحتمل إلى عميل نشط',
    backLink: '← العودة للعملاء',
    aboutToContact: 'هؤلاء أشخاص قمت بتسجيلهم لكن لم تتواصل معهم بعد.',
    aboutLead: 'هؤلاء أشخاص تواصلت معهم مرة على الأقل — استمر في المتابعة.',
  },
} as const

function relativeAge(iso: string | null | undefined, t: { justNow: string; hoursAgo: string; daysAgo: string; never: string }): string {
  if (!iso) return t.never
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return t.never
  const diffMs = Date.now() - then
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return t.justNow
  if (hours < 24) return `${hours}${t.hoursAgo}`
  const days = Math.floor(hours / 24)
  return `${days}${t.daysAgo}`
}

// Build a wa.me click-to-chat URL. Strips non-digits — wa.me wants raw
// international format with no + or spaces.
function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 7) return null
  return `https://wa.me/${digits}`
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>
}) {
  const { q, filter } = await searchParams
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const isRtl = locale === 'ar'

  // Pull every lead-stage row. Two source statuses feed this page:
  // 'to_contact' = scanned/saved but no touch yet
  // 'lead'       = at least one touchpoint, ongoing nurturing
  const { data: leads } = await (supabaseClient as any)
    .from('clients')
    .select('id, company_name, full_name, email, phone, whatsapp, city, business_type, status, last_contacted_at, notes, created_at')
    .in('status', ['to_contact', 'lead'])
    .order('last_contacted_at', { ascending: true, nullsFirst: true })

  const all = (leads as any[]) ?? []
  const today = new Date().toISOString().slice(0, 10)
  const FOURTEEN_DAYS_MS = 14 * 86_400_000

  let filtered = all
  if (q) {
    const lq = q.toLowerCase()
    filtered = filtered.filter((l: any) =>
      (l.company_name || '').toLowerCase().includes(lq) ||
      (l.full_name || '').toLowerCase().includes(lq) ||
      (l.email || '').toLowerCase().includes(lq) ||
      (l.phone || '').toLowerCase().includes(lq) ||
      (l.whatsapp || '').toLowerCase().includes(lq),
    )
  }
  if (filter === 'not_contacted') filtered = filtered.filter((l: any) => !l.last_contacted_at)
  if (filter === 'contacted')     filtered = filtered.filter((l: any) => !!l.last_contacted_at)
  if (filter === 'stale')         filtered = filtered.filter((l: any) => {
    if (!l.last_contacted_at) return false
    return Date.now() - Date.parse(l.last_contacted_at) > FOURTEEN_DAYS_MS
  })

  const total = all.length
  const awaiting = all.filter((l: any) => !l.last_contacted_at).length
  const contactedToday = all.filter((l: any) => {
    if (!l.last_contacted_at) return false
    return l.last_contacted_at.slice(0, 10) === today
  }).length
  const stale = all.filter((l: any) => {
    if (!l.last_contacted_at) return false
    return Date.now() - Date.parse(l.last_contacted_at) > FOURTEEN_DAYS_MS
  }).length

  const filters: { key: string; label: string }[] = [
    { key: 'all', label: t.filterAll },
    { key: 'not_contacted', label: t.filterNotContacted },
    { key: 'contacted', label: t.filterContacted },
    { key: 'stale', label: t.filterStale },
  ]

  return (
    <div className="space-y-6 pb-10" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Sparkles className="h-7 w-7 text-amber-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-2xl">
            {t.pageSub}
          </p>
        </div>
        <Link href="/clients/new">
          <button className="btn btn-primary shadow-lg shadow-[hsl(var(--primary)/0.2)] flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> {t.addLead}
          </button>
        </Link>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t.totalLeads,      value: total,           sub: t.pageSub.slice(0, 36), color: 'border-l-amber-500',   icon: Sparkles },
          { label: t.awaiting,        value: awaiting,        sub: t.aboutToContact,       color: 'border-l-pink-500',    icon: Clock },
          { label: t.contactedToday,  value: contactedToday,  sub: t.aboutLead,            color: 'border-l-emerald-500', icon: MessageCircle },
          { label: t.staleLeads,      value: stale,           sub: '> 14d',                color: 'border-l-red-500',     icon: AlertCircle },
        ].map((kpi, i) => (
          <div key={i} className={`premium-card p-4 border-l-4 ${kpi.color} flex items-center gap-4`}>
            <kpi.icon className="h-8 w-8 text-[hsl(var(--muted-foreground))] opacity-40 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-2xl font-black">{kpi.value}</p>
              <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{kpi.label}</p>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))/0.7] truncate">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* SEARCH + FILTER PILLS */}
      <div className="premium-card p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <form action="/leads" method="GET" className="flex-1 min-w-0">
          <div className="relative">
            <input
              name="q"
              defaultValue={q || ''}
              placeholder={t.searchPlaceholder}
              dir={isRtl ? 'rtl' : 'ltr'}
              className={`h-10 w-full rounded-xl text-sm bg-[hsl(var(--muted)/0.4)] border border-transparent text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--primary))] focus:bg-[hsl(var(--card))] focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] ${isRtl ? 'pr-3 pl-3 text-right' : 'px-3 text-left'}`}
            />
            {filter && filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
          </div>
        </form>
        <div className="flex gap-1.5 flex-wrap">
          {filters.map((f) => {
            const active = (filter || 'all') === f.key
            const href = f.key === 'all'
              ? (q ? `/leads?q=${encodeURIComponent(q)}` : '/leads')
              : `/leads?filter=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`
            return (
              <Link key={f.key} href={href}>
                <button className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${active ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))] shadow-sm' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'}`}>
                  {f.label}
                </button>
              </Link>
            )
          })}
        </div>
      </div>

      {/* LEADS TABLE */}
      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colCompany}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colChannels}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colLastContact}</th>
                <th className={isRtl ? 'text-right' : 'text-left'}>{t.colStatus}</th>
                <th className={isRtl ? 'text-left' : 'text-right'}>{t.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-15" />
                    <p className="text-[hsl(var(--muted-foreground))] font-medium">{t.noLeads}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 max-w-md mx-auto">{t.noLeadsHint}</p>
                  </td>
                </tr>
              )}
              {filtered.map((lead: any) => {
                const last = relativeAge(lead.last_contacted_at, t)
                const isStale = lead.last_contacted_at && Date.now() - Date.parse(lead.last_contacted_at) > FOURTEEN_DAYS_MS
                const wa = waLink(lead.whatsapp || lead.phone)
                return (
                  <tr key={lead.id} className="hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
                    <td>
                      <Link href={`/clients/${lead.id}`} className="block group">
                        <p className="font-bold text-sm group-hover:text-[hsl(var(--primary))] transition-colors">{lead.company_name || '—'}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{lead.full_name || '—'}{lead.business_type ? ` · ${lead.business_type}` : ''}{lead.city ? ` · ${lead.city}` : ''}</p>
                      </Link>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {wa && (
                          <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors text-[11px] font-semibold border border-emerald-500/30">
                            <MessageCircle className="h-3 w-3" /> {t.contactWA}
                          </a>
                        )}
                        {lead.email && (
                          <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500 hover:text-white transition-colors text-[11px] font-semibold border border-blue-500/30">
                            <Mail className="h-3 w-3" /> {t.contactEmail}
                          </a>
                        )}
                        {lead.phone && (
                          <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-700 hover:text-white transition-colors text-[11px] font-semibold border border-gray-300 dark:border-gray-700">
                            <Phone className="h-3 w-3" /> {t.contactCall}
                          </a>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`text-xs ${isStale ? 'text-red-600 font-semibold' : !lead.last_contacted_at ? 'text-pink-600 font-semibold' : 'text-[hsl(var(--muted-foreground))]'}`}>
                        {last}
                      </span>
                    </td>
                    <td>
                      <span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${lead.status === 'to_contact' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                        {lead.status === 'to_contact' ? t.statusToContact : t.statusLead}
                      </span>
                    </td>
                    <td className={isRtl ? 'text-left' : 'text-right'}>
                      <LeadActions
                        leadId={lead.id}
                        markContactedLabel={t.markContacted}
                        promoteLabel={t.promote}
                        promoteHint={t.promoteHint}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-[hsl(var(--muted-foreground))] text-center">
        {t.rowHint}
      </p>
    </div>
  )
}
