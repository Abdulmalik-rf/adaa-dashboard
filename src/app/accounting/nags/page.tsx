import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Bell, AlertOctagon, MailCheck, CheckCircle2 } from 'lucide-react'
import { NagRow } from './NagRow'

export const revalidate = 0

const T = {
  en: {
    pageTitle: 'Overdue Invoice Nag-bot',
    pageSub: 'Drafts the agent prepared for overdue invoices. Review the wording, edit if needed, then send via email straight from here — or reply "send" / "skip" on WhatsApp to fire via the bot.',
    backLink: '← Back to accounting',
    pending: 'Pending review',
    sent: 'Sent',
    skipped: 'Skipped',
    rejected: 'Rejected',
    none: 'No drafts pending. The scheduler creates these automatically when invoices age past 7, 14, and 30 days.',
    history: 'Recent history',
    stageGentle: 'Gentle nudge · 7 days',
    stageFirm: 'Firm follow-up · 14 days',
    stageEscalation: 'Escalation · 30 days',
  },
  ar: {
    pageTitle: 'تذكيرات الفواتير المتأخرة',
    pageSub: 'مسودات أعدّها الوكيل للفواتير المتأخرة. راجع الصياغة، عدّل عند الحاجة، ثم أرسل عبر البريد من هنا مباشرة — أو رد بـ "send" / "skip" على واتساب لإرسال الرسالة عبر البوت.',
    backLink: '← العودة إلى المحاسبة',
    pending: 'بانتظار المراجعة',
    sent: 'مُرسلة',
    skipped: 'متخطّاة',
    rejected: 'مرفوضة',
    none: 'لا توجد مسودات. ينشئ المجدول هذه المسودات تلقائياً عندما تتأخر الفواتير 7 و14 و30 يوماً.',
    history: 'السجل الأخير',
    stageGentle: 'تذكير لطيف · 7 أيام',
    stageFirm: 'متابعة حازمة · 14 يوم',
    stageEscalation: 'تصعيد · 30 يوم',
  },
} as const

const stageColor: Record<string, string> = {
  gentle_7d: 'border-l-amber-500',
  firm_14d: 'border-l-orange-500',
  escalation_30d: 'border-l-red-500',
}
const statusBadge: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  sent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  skipped: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  admin_rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

export default async function NagsPage() {
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const ar = locale === 'ar'

  const { data: nags } = await (supabaseClient as any)
    .from('invoice_nag_log')
    .select(`
      id, stage, status, channel, draft_text, sent_at, created_at,
      invoice:invoice_id (id, invoice_number, customer_name, total, currency, issue_date)
    `)
    .order('created_at', { ascending: false })
    .limit(80)

  const all = (nags as any[]) ?? []
  const pending = all.filter((n) => n.status === 'pending')
  const history = all.filter((n) => n.status !== 'pending')

  const stageLabel: Record<string, string> = {
    gentle_7d: t.stageGentle,
    firm_14d: t.stageFirm,
    escalation_30d: t.stageEscalation,
  }
  const statusLabel: Record<string, string> = {
    pending: t.pending,
    sent: t.sent,
    skipped: t.skipped,
    admin_rejected: t.rejected,
  }

  return (
    <div className="space-y-6 pb-10" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Bell className="h-7 w-7 text-amber-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <Link href="/accounting" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
          {t.backLink}
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="premium-card p-4 border-l-4 border-l-amber-500">
          <p className="text-2xl font-black">{pending.length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.pending}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-emerald-500">
          <p className="text-2xl font-black">{all.filter((n) => n.status === 'sent').length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.sent}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-gray-500">
          <p className="text-2xl font-black">{all.filter((n) => n.status === 'skipped').length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.skipped}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-red-500">
          <p className="text-2xl font-black">{all.filter((n) => n.status === 'admin_rejected').length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.rejected}</p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="premium-card p-10 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{t.none}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((n: any) => (
            <NagRow
              key={n.id}
              nag={n}
              ar={ar}
              stageLabel={stageLabel[n.stage] ?? n.stage}
              stageColor={stageColor[n.stage] ?? 'border-l-amber-500'}
            />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="premium-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
            <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
              <MailCheck className="h-4 w-4" /> {t.history} — {history.length}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
                <tr>
                  <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{ar ? 'الفاتورة' : 'Invoice'}</th>
                  <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{ar ? 'العميل' : 'Client'}</th>
                  <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{ar ? 'المرحلة' : 'Stage'}</th>
                  <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{ar ? 'الحالة' : 'Status'}</th>
                  <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{ar ? 'القناة' : 'Channel'}</th>
                  <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{ar ? 'تاريخ الإرسال' : 'Sent at'}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((n: any) => (
                  <tr key={n.id} className="border-t border-[hsl(var(--border))]">
                    <td className="px-3 py-2 text-xs font-semibold">
                      <Link href={`/accounting/${n.invoice?.id ?? ''}`} className="text-[hsl(var(--primary))] hover:underline">
                        {n.invoice?.invoice_number ?? '—'}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{n.invoice?.customer_name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{stageLabel[n.stage] ?? n.stage}</td>
                    <td className="px-3 py-2">
                      <span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusBadge[n.status] || statusBadge.pending}`}>
                        {statusLabel[n.status] ?? n.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{n.channel ?? '—'}</td>
                    <td className="px-3 py-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                      {n.sent_at ? new Date(n.sent_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
