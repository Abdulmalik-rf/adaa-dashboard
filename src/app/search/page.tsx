import Link from 'next/link'
import { supabaseClient } from '@/lib/supabase/client'
import {
  Users, FileText, CheckSquare, Receipt, FileBarChart2, Bell, BarChart3, Search as SearchIcon,
} from 'lucide-react'

export const revalidate = 0
export const dynamic = 'force-dynamic'

// Unified search across clients, contracts, tasks, quotations, weekly
// reports, reminders, ad campaigns. Each section runs an `ilike` against
// 1-3 likely columns. No fuzzy/typo tolerance — we rely on Postgres ILIKE.

type Hit = {
  id: string
  title: string
  subtitle?: string
  href: string
  meta?: string
}

function emptyOnError<T>(p: Promise<{ data: T | null }>): Promise<T> {
  return p.then(({ data }) => (data ?? ([] as unknown as T))).catch(() => ([] as unknown as T))
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = (q ?? '').trim()
  const like = `%${query.replace(/[%_]/g, (m) => '\\' + m)}%`

  if (!query) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <SearchIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <h1 className="text-xl font-bold mb-2">Search the dashboard</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Type into the search bar above to find clients, contracts, tasks, quotations, reports, reminders, and campaigns.
        </p>
      </div>
    )
  }

  const sb = supabaseClient as any

  const [clients, contracts, tasks, quotations, reports, reminders, campaigns] =
    await Promise.all([
      emptyOnError(
        sb.from('clients')
          .select('id, company_name, full_name, email, status')
          .or(`company_name.ilike.${like},full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
          .limit(20),
      ),
      emptyOnError(
        sb.from('contracts')
          .select('id, title, status, value, client_id')
          .ilike('title', like)
          .limit(20),
      ),
      emptyOnError(
        sb.from('tasks')
          .select('id, title, status, priority, due_date')
          .or(`title.ilike.${like},description.ilike.${like}`)
          .limit(20),
      ),
      emptyOnError(
        sb.from('quotations')
          .select('id, quote_number, client_company, client_name_en, status, total')
          .or(`quote_number.ilike.${like},client_company.ilike.${like},client_name_en.ilike.${like}`)
          .limit(20),
      ),
      emptyOnError(
        sb.from('weekly_reports')
          .select('id, report_number, customer_name, customer_company, status')
          .or(`report_number.ilike.${like},customer_name.ilike.${like},customer_company.ilike.${like}`)
          .limit(20),
      ),
      emptyOnError(
        sb.from('reminders')
          .select('id, title, due_date, priority, status')
          .ilike('title', like)
          .limit(20),
      ),
      emptyOnError(
        sb.from('ad_campaigns')
          .select('id, name, status, budget, client_id')
          .ilike('name', like)
          .limit(20),
      ),
    ])

  const groups: { name: string; icon: any; href: string; hits: Hit[] }[] = [
    {
      name: 'Clients', icon: Users, href: '/clients',
      hits: (clients as any[]).map((c) => ({
        id: c.id,
        title: c.company_name,
        subtitle: c.full_name || c.email,
        href: `/clients/${c.id}`,
        meta: c.status,
      })),
    },
    {
      name: 'Contracts', icon: FileText, href: '/contracts',
      hits: (contracts as any[]).map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: c.status,
        href: '/contracts',
        meta: c.value ? `${Number(c.value).toLocaleString()} SAR` : undefined,
      })),
    },
    {
      name: 'Tasks', icon: CheckSquare, href: '/tasks',
      hits: (tasks as any[]).map((t) => ({
        id: t.id,
        title: t.title,
        subtitle: `${t.status}${t.priority ? ' · ' + t.priority : ''}`,
        href: '/tasks',
        meta: t.due_date ? `due ${t.due_date}` : undefined,
      })),
    },
    {
      name: 'Quotations', icon: Receipt, href: '/quotations',
      hits: (quotations as any[]).map((q) => ({
        id: q.id,
        title: q.quote_number,
        subtitle: q.client_company || q.client_name_en,
        href: `/quotations/${q.id}`,
        meta: q.status,
      })),
    },
    {
      name: 'Weekly reports', icon: FileBarChart2, href: '/reports',
      hits: (reports as any[]).map((r) => ({
        id: r.id,
        title: r.report_number,
        subtitle: r.customer_company || r.customer_name,
        href: `/reports/${r.id}`,
        meta: r.status,
      })),
    },
    {
      name: 'Reminders', icon: Bell, href: '/reminders',
      hits: (reminders as any[]).map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.priority,
        href: '/reminders',
        meta: r.due_date,
      })),
    },
    {
      name: 'Campaigns', icon: BarChart3, href: '/campaigns',
      hits: (campaigns as any[]).map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: c.status,
        href: '/campaigns',
        meta: c.budget ? `${Number(c.budget).toLocaleString()} SAR` : undefined,
      })),
    },
  ]

  const totalHits = groups.reduce((s, g) => s + g.hits.length, 0)

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SearchIcon className="h-5 w-5" />
          Results for &quot;{query}&quot;
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          {totalHits} {totalHits === 1 ? 'match' : 'matches'} across {groups.filter((g) => g.hits.length > 0).length} {groups.filter((g) => g.hits.length > 0).length === 1 ? 'section' : 'sections'}.
        </p>
      </div>

      {totalHits === 0 && (
        <div className="premium-card p-12 text-center">
          <SearchIcon className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="font-semibold">No matches</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            Try a shorter query, a different spelling, or check the entity directly.
          </p>
        </div>
      )}

      {groups.filter((g) => g.hits.length > 0).map((group) => {
        const Icon = group.icon
        return (
          <div key={group.name} className="premium-card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
              <h2 className="font-bold text-sm flex items-center gap-2">
                <Icon className="h-4 w-4 text-[hsl(var(--primary))]" />
                {group.name}
                <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
                  ({group.hits.length})
                </span>
              </h2>
              <Link href={group.href} className="text-xs text-[hsl(var(--primary))] font-semibold hover:underline">
                View all →
              </Link>
            </div>
            <div className="divide-y divide-[hsl(var(--border))/0.5]">
              {group.hits.map((h) => (
                <Link
                  key={h.id}
                  href={h.href}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-[hsl(var(--muted)/0.3)] transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate group-hover:text-[hsl(var(--primary))]">
                      {h.title}
                    </p>
                    {h.subtitle && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 truncate">
                        {h.subtitle}
                      </p>
                    )}
                  </div>
                  {h.meta && (
                    <span className="badge badge-secondary text-[10px] flex-shrink-0">
                      {h.meta}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
