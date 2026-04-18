'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, FileText, Bell, Calendar, Folder, Settings,
  TrendingUp, CheckSquare, Zap, Menu, X, Camera, Target,
  ChevronDown, ChevronRight, BarChart3, MessageSquare, Sparkles
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

export function Sidebar() {
  const { t, dir } = useLanguage()
  const pathname = usePathname()
  const [socialOpen, setSocialOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setSocialOpen(pathname.startsWith('/social'))
  }, [pathname])

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const socialPlatforms = [
    { name: t.instagram, href: '/social/instagram', icon: Camera, color: 'text-pink-500' },
    { name: t.tiktok, href: '/social/tiktok', icon: Zap, color: 'text-slate-800 dark:text-white' },
    { name: t.snapchat, href: '/social/snapchat', icon: Camera, color: 'text-yellow-500' },
    { name: t.googleAds, href: '/social/google-ads', icon: Target, color: 'text-blue-500' },
  ]

  const navTop = [
    { name: t.dashboard, href: '/', icon: LayoutDashboard },
    { name: t.myWorkspace, href: '/my-dashboard', icon: Sparkles },
    { name: t.finance, href: '/finance', icon: BarChart3 },
    { name: t.clients, href: '/clients', icon: Users },
    { name: t.tasks, href: '/tasks', icon: CheckSquare },
    { name: t.myTasks, href: '/my-tasks', icon: Bell },
    { name: t.scheduler, href: '/scheduler', icon: Calendar },
  ]

  const navBottom = [
    { name: t.team, href: '/team', icon: Users },
    { name: t.contracts, href: '/contracts', icon: FileText },
    { name: t.files, href: '/files', icon: Folder },
    { name: t.campaigns, href: '/campaigns', icon: BarChart3 },
    { name: t.reminders, href: '/reminders', icon: MessageSquare },
    { name: t.settings, href: '/settings', icon: Settings },
  ]

  const SidebarContent = () => (
    <div className={`flex h-full flex-col bg-[hsl(var(--card))] border-${dir === 'rtl' ? 'l' : 'r'} border-[hsl(var(--border))] w-64`}>
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-[hsl(var(--border))] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-[hsl(var(--primary))] flex items-center justify-center shadow-md shadow-[hsl(var(--primary))/0.3]">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight gradient-text">AgencyOS</span>
        </div>
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

        {/* Social Media Section */}
        <div className="pt-2">
          <button
            onClick={() => setSocialOpen(!socialOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <span>{t.socialStudio}</span>
            {socialOpen ? <ChevronDown className="h-3 w-3" /> : (dir === 'rtl' ? <ChevronDown className="h-3 w-3 rotate-90" /> : <ChevronRight className="h-3 w-3" />)}
          </button>
          
          {socialOpen && (
            <div className={`space-y-0.5 px-2 border-${dir === 'rtl' ? 'r' : 'l'}-2 border-[hsl(var(--border))] m${dir === 'rtl' ? 'r' : 'l'}-3`}>
              {socialPlatforms.map((platform) => (
                <Link
                  key={platform.href}
                  href={platform.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive(platform.href)
                      ? 'sidebar-link-active bg-[hsl(var(--primary)/0.1)'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)]'
                  }`}
                >
                  <platform.icon className={`h-4 w-4 flex-shrink-0 ${platform.color}`} />
                  {platform.name}
                </Link>
              ))}
            </div>
          )}
        </div>

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

      {/* User footer */}
      <div className="border-t border-[hsl(var(--border))] p-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
            FA
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">Fahad Al-Dossari</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">Agency Admin</p>
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
