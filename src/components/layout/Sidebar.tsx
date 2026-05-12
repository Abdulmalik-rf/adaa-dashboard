'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import {
  LayoutDashboard, Users, FileText, Bell, Folder, Settings,
  CheckSquare, Menu, X, CalendarDays, Image as ImageIcon, Activity,
  BarChart3, MessageSquare, Sparkles, FileBarChart2
} from 'lucide-react'
import { useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface CurrentUser {
  id?: string
  email?: string
  profile?: { full_name?: string; role?: string; avatar_url?: string } | null
}

export function Sidebar({ isAdmin = false, currentUser }: { isAdmin?: boolean; currentUser?: CurrentUser | null }) {
  const { t, dir } = useLanguage()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Real user info for the sidebar footer (replaces hardcoded "Fahad Al-Dossari / Agency Admin")
  const displayName =
    currentUser?.profile?.full_name ||
    currentUser?.email?.split('@')[0] ||
    'User'
  const roleRaw = currentUser?.profile?.role || (isAdmin ? 'admin' : 'user')
  const displayRole =
    roleRaw === 'admin'
      ? ((t as any).roleAdmin ?? 'Admin')
      : roleRaw === 'manager'
        ? ((t as any).roleManager ?? 'Manager')
        : roleRaw === 'staff'
          ? ((t as any).roleStaff ?? 'Staff')
          : ((t as any).roleUser ?? 'User')
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U'

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  // adminOnly items are filtered out of the rendered nav for non-admin
  // viewers. Direct URL access is also blocked server-side via
  // requireAdmin() at the top of each admin-only page.
  const navTop = [
    { name: t.dashboard, href: '/', icon: LayoutDashboard, adminOnly: true },
    { name: t.myWorkspace, href: '/my-dashboard', icon: Sparkles },
    { name: t.finance, href: '/finance', icon: BarChart3, adminOnly: true },
    { name: t.clients, href: '/clients', icon: Users, adminOnly: true },
    { name: t.tasks, href: '/tasks', icon: CheckSquare, adminOnly: true },
    { name: t.myTasks, href: '/my-tasks', icon: Bell },
  ].filter((item) => isAdmin || !item.adminOnly)

  const navBottom = [
    { name: t.team, href: '/team', icon: Users, adminOnly: true },
    { name: t.contracts, href: '/contracts', icon: FileText, adminOnly: true },
    { name: (t as any).quotationsManagement ?? 'Quotations', href: '/quotations', icon: FileText, adminOnly: true },
    { name: (t as any).weeklyReports ?? 'Weekly Reports', href: '/reports', icon: FileBarChart2 },
    { name: (t as any).calendarView ?? 'Calendar', href: '/calendar', icon: CalendarDays },
    { name: (t as any).content ?? 'Content', href: '/content', icon: ImageIcon },
    { name: t.files, href: '/files', icon: Folder },
    { name: t.campaigns, href: '/campaigns', icon: BarChart3 },
    { name: t.reminders, href: '/reminders', icon: MessageSquare },
    { name: 'Agent Audit', href: '/admin/audit', icon: Activity, adminOnly: true },
    { name: t.settings, href: '/settings', icon: Settings },
  ].filter((item) => isAdmin || !item.adminOnly)

  const SidebarContent = () => (
    <div className={`flex h-full flex-col bg-[hsl(var(--card))] border-${dir === 'rtl' ? 'l' : 'r'} border-[hsl(var(--border))] w-64`}>
      {/* Logo — fills the sidebar width edge-to-edge. The container has
          no fixed height; it derives from the wordmark's natural 1.93:1
          aspect ratio (256px wide × ~133px tall on a w-64 sidebar). */}
      <div className="bg-white border-b border-[hsl(var(--border))] flex-shrink-0">
        <Image
          src="/emergize-logo.png"
          alt="Emergize"
          width={400}
          height={208}
          priority
          className="w-full h-auto block"
        />
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {/* Main nav */}
        {navTop.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
              isActive(item.href)
                ? 'sidebar-link-active bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)]'
            }`}
          >
            <item.icon className={`h-4 w-4 flex-shrink-0 ${isActive(item.href) ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`} />
            {item.name}
          </Link>
        ))}

        {/* Divider */}
        <div className="border-t border-[hsl(var(--border))] my-3" />

        {/* More nav items */}
        {navBottom.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
              isActive(item.href)
                ? 'sidebar-link-active bg-[hsl(var(--primary)/0.1)'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)]'
            }`}
          >
            <item.icon className={`h-4 w-4 flex-shrink-0 ${isActive(item.href) ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`} />
            {item.name}
          </Link>
        ))}
      </div>

      {/* User footer — shows the actual signed-in user's name + role */}
      <div className="border-t border-[hsl(var(--border))] p-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-zinc-900 flex items-center justify-center text-zinc-900 text-xs font-bold shadow-md"
            title={currentUser?.email ?? ''}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate" title={displayName}>
              {displayName}
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate" title={currentUser?.email ?? ''}>
              {displayRole}
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex h-full w-64 flex-shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile toggle */}
      <button
        className={`lg:hidden fixed top-4 ${dir === 'rtl' ? 'right-4' : 'left-4'} z-50 p-2 rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-md`}
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
          <div className={`fixed ${dir === 'rtl' ? 'right-0' : 'left-0'} top-0 bottom-0 z-40 lg:hidden w-64`}>
            <SidebarContent />
          </div>
        </>
      )}
    </>
  )
}
