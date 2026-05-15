'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { Briefcase, AlertTriangle, ClipboardList, UserPlus, FileText, FileBadge, TrendingUp, Clock, Calculator } from 'lucide-react'

// Pill strip on every /hr/** page. Mirrors AccountingSubNav.
export function HrSubNav() {
  const pathname = usePathname()
  const { t } = useLanguage()

  const items = [
    { href: '/hr',                 key: 'main',        icon: Briefcase,     label: (t as any).hrNav ?? 'HR' },
    { href: '/hr/expiries',        key: 'expiries',    icon: AlertTriangle, label: (t as any).hrExpiriesNav ?? 'Expiries' },
    { href: '/hr/onboarding',      key: 'onboarding',  icon: ClipboardList, label: (t as any).hrOnboardingNav ?? 'Onboarding' },
    { href: '/hr/candidates',      key: 'candidates',  icon: UserPlus,      label: (t as any).hrCandidatesNav ?? 'Candidates' },
    { href: '/hr/letters',         key: 'letters',     icon: FileText,      label: (t as any).hrLettersNav ?? 'Letters' },
    { href: '/hr/documents',       key: 'documents',   icon: FileBadge,     label: (t as any).hrDocumentsNav ?? 'Documents' },
    { href: '/hr/performance',     key: 'performance', icon: TrendingUp,    label: (t as any).hrPerformanceNav ?? 'Performance' },
    { href: '/hr/attendance',      key: 'attendance',  icon: Clock,         label: (t as any).hrAttendanceNav ?? 'Attendance' },
    { href: '/hr/eosb',            key: 'eosb',        icon: Calculator,    label: (t as any).hrEosbNav ?? 'EOSB' },
  ] as const

  function isActive(href: string): boolean {
    if (href === '/hr') return pathname === '/hr'
    return pathname?.startsWith(href) ?? false
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const active = isActive(it.href)
        return (
          <Link
            key={it.key}
            href={it.href}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              active
                ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))] shadow-sm'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'
            }`}>
            <it.icon className="h-3.5 w-3.5" />
            {it.label}
          </Link>
        )
      })}
    </div>
  )
}
