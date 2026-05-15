'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { Receipt, Wallet, FileText, Banknote, Bell } from 'lucide-react'

// Pill strip shown above every /accounting/** page. Highlights the active
// sub-section based on the deepest matching prefix.
export function AccountingSubNav() {
  const pathname = usePathname()
  const { t } = useLanguage()

  const items = [
    { href: '/accounting',                key: 'inv',     icon: Receipt,  label: (t as any).invoicesNav ?? 'Invoices' },
    { href: '/accounting/bills',          key: 'bills',   icon: Wallet,   label: (t as any).billsNav ?? 'Bills' },
    { href: '/accounting/vat-return',     key: 'vat',     icon: FileText, label: (t as any).vatReturnNav ?? 'VAT Return' },
    { href: '/accounting/reconciliation', key: 'recon',   icon: Banknote, label: (t as any).reconciliationNav ?? 'Reconciliation' },
    { href: '/accounting/nags',           key: 'nags',    icon: Bell,     label: (t as any).nagsNav ?? 'Nags' },
  ] as const

  // For "/accounting" we need exact match (otherwise it lights up on every
  // sub-route). For sub-routes use prefix.
  function isActive(href: string): boolean {
    if (href === '/accounting') {
      return pathname === '/accounting' || /^\/accounting\/[0-9a-f-]{6,}$/.test(pathname || '')
    }
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
