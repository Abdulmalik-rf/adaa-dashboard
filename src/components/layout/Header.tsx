'use client'

import { Bell, Search, Sun, Moon, ChevronDown, Check, X, Languages, LogOut } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { markNotificationRead, markAllNotificationsRead } from '@/app/actions/notifications'
import { logoutAction } from '@/app/login/actions'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface Notification {
  id: string
  title: string
  message: string
  type: string
  is_read: boolean
  created_at: string
  related_id?: string
}

interface CurrentUser {
  id: string
  email?: string
  profile?: { full_name?: string; role?: string; avatar_url?: string } | null
}

export function Header({
  notifications: initialNotifications,
  currentUser,
}: {
  notifications: Notification[]
  currentUser?: CurrentUser | null
}) {
  const { t, language, setLanguage, dir } = useLanguage()
  const [dark, setDark] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications || [])
  const notifRef = useRef<HTMLDivElement>(null)
  const langRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  const displayName = currentUser?.profile?.full_name || currentUser?.email?.split('@')[0] || 'User'
  const displayRole = currentUser?.profile?.role === 'admin' ? 'Admin' : 'User'
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U'

  const unreadCount = notifications.filter(n => !n.is_read).length

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'dark') {
      document.documentElement.classList.add('dark')
      setDark(true)
    }
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false)
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const toggleDark = () => {
    const newDark = !dark
    setDark(newDark)
    if (newDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const typeIcon: Record<string, string> = {
    task_assigned: '📋',
    task_completed: '✅',
    contract_alert: '📄',
    content_approved: '🎉',
    content_rejected: '❌',
    system: '🔔',
    default: '📢'
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] flex-shrink-0 sticky top-0 z-30">
      {/* Left: Search */}
      <div className="relative max-w-sm w-full hidden md:block">
        <Search className={`absolute ${dir === 'rtl' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]`} />
        <input
          placeholder={t.search}
          className={`form-input h-9 text-sm bg-[hsl(var(--muted)/0.4)] border-transparent focus:border-[hsl(var(--primary))] focus:bg-[hsl(var(--card))] ${dir === 'rtl' ? 'pr-10 pl-3' : 'pl-10 pr-3'}`}
        />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 mr-0 ml-auto" style={{ marginRight: dir === 'rtl' ? 'auto' : 0, marginLeft: dir === 'rtl' ? 0 : 'auto' }}>
        
        {/* Language switcher */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="btn btn-ghost btn-icon text-[hsl(var(--muted-foreground))]"
            title={t.language}
          >
            <Languages className="h-4 w-4" />
          </button>
          
          {langOpen && (
            <div className={`absolute ${dir === 'rtl' ? 'left-0' : 'right-0'} top-full mt-2 w-32 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-lg z-50 overflow-hidden`}>
               <button
                 onClick={() => { setLanguage('en'); setLangOpen(false) }}
                 className={`w-full text-left px-4 py-2 text-sm hover:bg-[hsl(var(--muted)/0.5)] ${language === 'en' ? 'font-bold text-[hsl(var(--primary))]' : ''}`}
               >
                 English
               </button>
               <button
                 onClick={() => { setLanguage('ar'); setLangOpen(false) }}
                 className={`w-full text-left px-4 py-2 text-sm hover:bg-[hsl(var(--muted)/0.5)] ${language === 'ar' ? 'font-bold text-[hsl(var(--primary))]' : ''}`}
               >
                 العربية
               </button>
            </div>
          )}
        </div>

        {/* Dark mode */}
        <button
          onClick={toggleDark}
          className="btn btn-ghost btn-icon text-[hsl(var(--muted-foreground))]"
          title="Toggle theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="btn btn-ghost btn-icon text-[hsl(var(--muted-foreground))] relative"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Panel */}
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-2xl shadow-black/10 z-50 animate-slide-up overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
                <div>
                  <h3 className="font-semibold text-sm">Notifications</h3>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{unreadCount} unread</p>
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-[hsl(var(--primary))] font-medium hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setNotifOpen(false)} className="btn btn-ghost btn-icon h-7 w-7">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-[hsl(var(--border))]">
                {notifications.length === 0 && (
                  <div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No notifications
                  </div>
                )}
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 flex gap-3 hover:bg-[hsl(var(--muted)/0.3)] transition-colors ${!n.is_read ? 'bg-[hsl(var(--primary)/0.04)]' : ''}`}
                  >
                    <span className="text-lg flex-shrink-0 mt-0.5">{typeIcon[n.type] || typeIcon.default}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.is_read ? 'font-semibold' : 'font-medium'} text-[hsl(var(--foreground))]`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="flex-shrink-0 h-5 w-5 rounded-full bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] flex items-center justify-center hover:bg-[hsl(var(--primary))] hover:text-white transition-colors"
                        title="Mark as read"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="p-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
                <Link
                  href="/notifications"
                  onClick={() => setNotifOpen(false)}
                  className="block text-center text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
                >
                  View all notifications →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User avatar + menu */}
        <div className="relative flex items-center gap-2 ml-1 pl-2 border-l border-[hsl(var(--border))]" ref={userRef}>
          <button
            onClick={() => setUserOpen(!userOpen)}
            className="flex items-center gap-2 hover:opacity-80 transition"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
              {initials}
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-xs font-semibold text-[hsl(var(--foreground))]">{displayName}</p>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{displayRole}</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] hidden sm:block" />
          </button>

          {userOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[hsl(var(--border))]">
                <p className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">{displayName}</p>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] truncate">{currentUser?.email}</p>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
