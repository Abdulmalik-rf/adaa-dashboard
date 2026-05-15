import { supabaseClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Banknote, Calculator } from 'lucide-react'
import { RefreshEosbButton } from './RefreshEosbButton'

export const revalidate = 60

// KSA labour-law EOSB accrual:
//   • Years 1-5: 0.5 month salary per year
//   • Years 6+ : 1.0 month salary per year (linear from year 6 onward)
// We compute live (in addition to snapshots) so this page is always current.

function calcAccrued(monthly: number, years: number): number {
  if (years <= 0 || !monthly) return 0
  if (years <= 5) return monthly * 0.5 * years
  return monthly * 0.5 * 5 + monthly * 1.0 * (years - 5)
}

function yearsSince(iso: string | null): number {
  if (!iso) return 0
  const hire = new Date(iso + 'T00:00:00Z').getTime()
  const now = Date.now()
  if (now <= hire) return 0
  return (now - hire) / (365.25 * 86_400_000)
}

const T = {
  en: {
    pageTitle: 'End-of-Service Benefits',
    pageSub: "Saudi labour-law EOSB accrual per employee — kept up-to-date so you always know the team's cost-to-release. 0.5 month per year for the first 5 years, 1.0 month per year after.",
    backLink: '← Back to HR',
    refresh: 'Refresh snapshots',
    colEmployee: 'Employee', colSince: 'Hired', colYears: 'Years', colSalary: 'Monthly salary', colAccrued: 'Accrued EOSB',
    grandTotal: 'Total team liability',
    none: 'No active employees with hire_date + base_salary set.',
  },
  ar: {
    pageTitle: 'مكافأة نهاية الخدمة',
    pageSub: 'حساب مكافأة نهاية الخدمة لكل موظف وفقاً لنظام العمل السعودي — نصف راتب للسنوات الأولى الخمس، وراتب كامل لكل سنة بعدها.',
    backLink: '← العودة',
    refresh: 'تحديث اللقطات',
    colEmployee: 'الموظف', colSince: 'تاريخ التعيين', colYears: 'سنوات الخدمة', colSalary: 'الراتب الشهري', colAccrued: 'مكافأة مستحقة',
    grandTotal: 'إجمالي الالتزام',
    none: 'لا يوجد موظفون نشطون لديهم تاريخ تعيين وراتب أساسي.',
  },
} as const

export default async function EosbPage() {
  const locale = (await cookies()).get('locale')?.value === 'ar' ? 'ar' : 'en'
  const t = T[locale]
  const ar = locale === 'ar'

  const { data: emps } = await (supabaseClient as any)
    .from('team_members')
    .select('id, full_name, full_name_ar, base_salary, salary_currency, hire_date, status, employment_type')
    .eq('status', 'active')
    .order('hire_date', { ascending: true, nullsFirst: false })

  const rows = ((emps as any[]) ?? []).map((e) => {
    const years = yearsSince(e.hire_date)
    const monthly = Number(e.base_salary ?? 0)
    const accrued = calcAccrued(monthly, years)
    return {
      ...e,
      years_served: years,
      monthly,
      accrued: Math.round(accrued * 100) / 100,
    }
  }).filter((e) => e.hire_date && e.monthly > 0)

  const total = rows.reduce((s, r) => s + r.accrued, 0)
  const currency = rows.find((r) => r.salary_currency)?.salary_currency || 'SAR'

  return (
    <div className="space-y-6 pb-10" dir={ar ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Calculator className="h-7 w-7 text-purple-500" /> {t.pageTitle}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium max-w-3xl">{t.pageSub}</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshEosbButton label={t.refresh} />
          <Link href="/hr" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">{t.backLink}</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="premium-card p-4 border-l-4 border-l-purple-500">
          <p className="text-2xl font-black">{rows.length}</p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{ar ? 'موظفون نشطون' : 'Active employees'}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-emerald-500">
          <p className="text-2xl font-black">{total.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span className="text-sm">{currency}</span></p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{t.grandTotal}</p>
        </div>
        <div className="premium-card p-4 border-l-4 border-l-amber-500">
          <p className="text-2xl font-black">
            {rows.filter((r) => r.years_served >= 5).length}
          </p>
          <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{ar ? '5+ سنوات (راتب كامل/سنة)' : '5+ years (full month/yr)'}</p>
        </div>
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.2)]">
              <tr>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colEmployee}</th>
                <th className={`px-3 py-2 ${ar ? 'text-right' : 'text-left'}`}>{t.colSince}</th>
                <th className="px-3 py-2 text-right">{t.colYears}</th>
                <th className="px-3 py-2 text-right">{t.colSalary}</th>
                <th className="px-3 py-2 text-right">{t.colAccrued}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-12 text-center text-xs text-[hsl(var(--muted-foreground))] italic">{t.none}</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[hsl(var(--border))]">
                  <td className="px-3 py-2 font-semibold">{r.full_name}{r.full_name_ar ? <span className="text-[hsl(var(--muted-foreground))]"> · {r.full_name_ar}</span> : ''}</td>
                  <td className="px-3 py-2 text-xs">{r.hire_date}</td>
                  <td className="px-3 py-2 text-right text-xs">{r.years_served.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-xs">{r.monthly.toLocaleString('en-US')} {r.salary_currency || 'SAR'}</td>
                  <td className="px-3 py-2 text-right font-bold text-purple-700 dark:text-purple-400">{r.accrued.toLocaleString('en-US', { maximumFractionDigits: 0 })} {r.salary_currency || 'SAR'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
