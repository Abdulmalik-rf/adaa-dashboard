'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, Clock, AlertCircle, Calendar, Users, Briefcase,
  TrendingUp, Activity, Mail, Phone, Building2, ArrowUpRight,
  Sparkles, ListTodo, CalendarClock, Target
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { markTaskCompleted } from '@/app/actions/tasks'

const DICT = {
  en: {
    greeting: "Hi",
    welcome: "Here is your workspace for today",
    role: "Role",
    myWorkspace: "My Workspace",
    personalDashboard: "Personal Dashboard",
    pendingTasks: "Pending Tasks",
    dueToday: "Due Today",
    overdue: "Overdue",
    completedWeek: "Done this week",
    myTasks: "My Tasks",
    all: "All",
    pending: "Pending",
    today: "Today",
    late: "Late",
    myClients: "My Clients",
    myClientsSubtitle: "Customers you are actively working with",
    upcomingContent: "Upcoming Content",
    upcomingContentSubtitle: "Posts you need to prepare",
    noTasks: "All caught up. Enjoy your day!",
    noClients: "You haven't been assigned to any client yet.",
    noContent: "No scheduled content yet.",
    noActivity: "No recent activity",
    markDone: "Mark as Done",
    viewProfile: "View Profile",
    recentActivity: "Recent Activity",
    viewAllTasks: "View all tasks",
    viewAllClients: "View all clients",
    openScheduler: "Open scheduler",
    active: "active",
    complete: "complete",
    of: "of",
    pieces: "pieces",
    tasksAssigned: "tasks assigned to you",
    urgent: "urgent",
    priority: "priority",
    due: "Due",
    noContract: "No active contract",
    servicesLabel: "Services",
    myWork: "My work"
  },
  ar: {
    greeting: "مرحبًا",
    welcome: "هذه مساحة عملك لليوم",
    role: "الدور",
    myWorkspace: "مساحة عملي",
    personalDashboard: "لوحة التحكم الشخصية",
    pendingTasks: "مهام معلقة",
    dueToday: "مستحقة اليوم",
    overdue: "متأخرة",
    completedWeek: "منجزة هذا الأسبوع",
    myTasks: "مهامي",
    all: "الكل",
    pending: "معلقة",
    today: "اليوم",
    late: "متأخرة",
    myClients: "عملائي",
    myClientsSubtitle: "العملاء الذين تعمل معهم حاليًا",
    upcomingContent: "المحتوى القادم",
    upcomingContentSubtitle: "منشورات عليك تجهيزها",
    noTasks: "لا توجد مهام. استمتع بيومك!",
    noClients: "لم يتم تعيينك لأي عميل بعد.",
    noContent: "لا يوجد محتوى مجدول.",
    noActivity: "لا يوجد نشاط حديث",
    markDone: "وضع كمنجز",
    viewProfile: "عرض الملف",
    recentActivity: "النشاط الأخير",
    viewAllTasks: "عرض كل المهام",
    viewAllClients: "عرض كل العملاء",
    openScheduler: "فتح الجدول",
    active: "نشطة",
    complete: "مكتملة",
    of: "من",
    pieces: "عنصر",
    tasksAssigned: "مهمة مسندة إليك",
    urgent: "عاجلة",
    priority: "أولوية",
    due: "تستحق",
    noContract: "لا يوجد عقد نشط",
    servicesLabel: "الخدمات",
    myWork: "عملي"
  }
}

const PLATFORM_ICON: Record<string, string> = {
  instagram: '📸', tiktok: '🎬', snapchat: '👻', google_ads: '🎯',
}

const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'border-l-red-500 bg-red-50/30 dark:bg-red-900/10',
  high: 'border-l-orange-500 bg-orange-50/30 dark:bg-orange-900/10',
  medium: 'border-l-amber-500',
  low: 'border-l-gray-300',
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

export function MyDashboardClient({
  me, tasks, contentItems, clients, clientServices, contracts, notifications
}: any) {
  const { language, dir } = useLanguage()
  const d = DICT[language as 'en' | 'ar'] || DICT.en
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'today' | 'late'>('pending')

  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const findClient = (id: string) => clients.find((c: any) => c.id === id)
  const findClientName = (id: string) => findClient(id)?.company_name || '—'

  const pendingTasks = tasks.filter((t: any) => t.status !== 'completed')
  const completedTasks = tasks.filter((t: any) => t.status === 'completed')
  const overdueTasks = pendingTasks.filter((t: any) => t.due_date && t.due_date < today)
  const todayTasks = pendingTasks.filter((t: any) => t.due_date === today)
  const urgentTasks = pendingTasks.filter((t: any) => t.priority === 'urgent')
  const completedThisWeek = completedTasks.filter(
    (t: any) => t.completed_at && t.completed_at.split('T')[0] >= weekAgo
  )

  const pendingContent = contentItems.filter((c: any) => c.task_status !== 'completed')
  const upcomingContent = pendingContent
    .filter((c: any) => c.publish_date >= today)
    .sort((a: any, b: any) => (a.publish_date || '').localeCompare(b.publish_date || ''))

  const displayedTasks = useMemo(() => {
    switch (taskFilter) {
      case 'pending': return pendingTasks
      case 'today': return todayTasks
      case 'late': return overdueTasks
      case 'all':
      default: return tasks
    }
  }, [taskFilter, tasks, pendingTasks, todayTasks, overdueTasks])

  const servicesByClient = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const s of clientServices) {
      if (!m[s.client_id]) m[s.client_id] = []
      m[s.client_id].push(s.service_name)
    }
    return m
  }, [clientServices])

  const enrichedClients = useMemo(() => clients.map((c: any) => {
    const myPendingForClient = pendingTasks.filter((t: any) => t.client_id === c.id).length
    const myContentForClient = pendingContent.filter((ct: any) => ct.client_id === c.id).length
    const contract = contracts.find((ct: any) => ct.client_id === c.id && ct.status === 'active')
    return {
      ...c,
      myPending: myPendingForClient,
      myContent: myContentForClient,
      hasContract: !!contract,
      services: servicesByClient[c.id] || [],
    }
  }).sort((a: any, b: any) => (b.myPending + b.myContent) - (a.myPending + a.myContent)),
  [clients, pendingTasks, pendingContent, contracts, servicesByClient])

  const firstName = me?.full_name?.split(' ')[0] || 'there'
  const currentHour = new Date().getHours()
  const timeOfDay = currentHour < 12 ? '☀️' : currentHour < 18 ? '🌤️' : '🌙'

  const statCards = [
    {
      label: d.pendingTasks, value: pendingTasks.length, icon: ListTodo,
      border: 'border-l-blue-500', color: 'text-blue-500',
      sub: urgentTasks.length > 0 ? `${urgentTasks.length} ${d.urgent}` : d.myWork,
      subColor: urgentTasks.length > 0 ? 'text-red-500' : 'text-[hsl(var(--muted-foreground))]',
    },
    {
      label: d.dueToday, value: todayTasks.length, icon: CalendarClock,
      border: 'border-l-amber-500', color: 'text-amber-500',
      sub: d.today, subColor: 'text-[hsl(var(--muted-foreground))]',
    },
    {
      label: d.overdue, value: overdueTasks.length, icon: AlertCircle,
      border: overdueTasks.length > 0 ? 'border-l-red-500' : 'border-l-gray-300',
      color: overdueTasks.length > 0 ? 'text-red-500' : 'text-gray-400',
      sub: overdueTasks.length > 0 ? d.late : '✓',
      subColor: overdueTasks.length > 0 ? 'text-red-500' : 'text-emerald-500',
    },
    {
      label: d.completedWeek, value: completedThisWeek.length, icon: CheckCircle2,
      border: 'border-l-emerald-500', color: 'text-emerald-500',
      sub: d.complete, subColor: 'text-[hsl(var(--muted-foreground))]',
    },
  ]

  return (
    <div className="space-y-6 pb-20">

      {/* HEADER */}
      <div className="premium-card p-6 overflow-hidden relative bg-gradient-to-br from-[hsl(var(--primary)/0.08)] via-[hsl(var(--card))] to-purple-500/5">
        <div className="absolute -right-16 -top-16 opacity-5">
          <Sparkles className="h-64 w-64" />
        </div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-purple-600 flex items-center justify-center text-white text-lg font-black shadow-lg shadow-[hsl(var(--primary)/0.3)]">
              {me?.avatar_initials || firstName.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2">
                {d.greeting}, {firstName} <span className="text-xl">{timeOfDay}</span>
              </h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 font-medium">
                {d.welcome} · {new Date().toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              {me?.job_title && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="badge badge-secondary text-[10px] uppercase tracking-wider">{me.job_title}</span>
                  {me.role && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] uppercase tracking-wider">
                      {me.role}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center p-3 rounded-2xl bg-white/60 dark:bg-white/5 backdrop-blur border border-[hsl(var(--border))]">
              <div className="text-2xl font-black text-[hsl(var(--primary))]">{pendingTasks.length}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{d.pending}</div>
            </div>
            <div className="text-center p-3 rounded-2xl bg-white/60 dark:bg-white/5 backdrop-blur border border-[hsl(var(--border))]">
              <div className="text-2xl font-black text-emerald-500">{completedThisWeek.length}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{d.completedWeek}</div>
            </div>
          </div>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <div key={i} className={`premium-card p-5 border-l-4 ${s.border}`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div className="text-3xl font-black">{s.value}</div>
            <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${s.subColor}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">

        {/* LEFT: TASKS */}
        <div className="lg:col-span-2 space-y-6">
          <div className="premium-card overflow-hidden">
            <div className="p-5 border-b border-[hsl(var(--border))] flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-[hsl(var(--primary))]" /> {d.myTasks}
                </h2>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  {pendingTasks.length} {d.tasksAssigned}
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { id: 'pending', label: d.pending, count: pendingTasks.length },
                  { id: 'today', label: d.today, count: todayTasks.length },
                  { id: 'late', label: d.late, count: overdueTasks.length },
                  { id: 'all', label: d.all, count: tasks.length },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setTaskFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                      taskFilter === tab.id
                        ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))] shadow-sm'
                        : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'
                    }`}
                  >
                    {tab.label}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${taskFilter === tab.id ? 'bg-white/20' : 'bg-[hsl(var(--muted))]'}`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-[hsl(var(--border))]">
              {displayedTasks.length === 0 && (
                <div className="p-12 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500 opacity-40" />
                  <p className="text-sm font-semibold">{d.noTasks}</p>
                </div>
              )}
              {displayedTasks.map((t: any) => {
                const isOverdue = t.status !== 'completed' && t.due_date && t.due_date < today
                const isToday = t.due_date === today
                return (
                  <div key={t.id} className={`p-4 border-l-4 ${PRIORITY_STYLE[t.priority] || 'border-l-gray-300'} ${t.status === 'completed' ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`font-semibold text-sm ${t.status === 'completed' ? 'line-through' : ''}`}>{t.title}</h3>
                          {t.priority && (
                            <span className={`badge text-[10px] ${PRIORITY_BADGE[t.priority]}`}>{t.priority}</span>
                          )}
                          {isOverdue && <span className="badge text-[10px] bg-red-500 text-white">{d.late}</span>}
                          {isToday && <span className="badge text-[10px] bg-amber-500 text-white">{d.today}</span>}
                        </div>
                        {t.description && (
                          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 line-clamp-2">{t.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-[hsl(var(--muted-foreground))] flex-wrap">
                          {t.client_id && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> {findClientName(t.client_id)}
                            </span>
                          )}
                          {t.due_date && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {d.due} {t.due_date}
                            </span>
                          )}
                          {t.status && (
                            <span className="badge badge-secondary text-[10px]">{t.status}</span>
                          )}
                        </div>
                      </div>
                      {t.status !== 'completed' && (
                        <form action={markTaskCompleted.bind(null, t.id, 'task', 'completed')}>
                          <button type="submit" className="btn btn-xs btn-primary whitespace-nowrap">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {d.markDone}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="p-3 border-t border-[hsl(var(--border))] text-center bg-[hsl(var(--muted)/0.3)]">
              <Link href="/my-tasks" className="text-xs text-[hsl(var(--primary))] font-bold hover:underline">
                {d.viewAllTasks} →
              </Link>
            </div>
          </div>

          {/* UPCOMING CONTENT */}
          <div className="premium-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-pink-500" /> {d.upcomingContent}
                </h2>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{d.upcomingContentSubtitle}</p>
              </div>
              <Link href="/scheduler" className="text-xs text-[hsl(var(--primary))] font-bold hover:underline whitespace-nowrap">
                {d.openScheduler} →
              </Link>
            </div>
            {upcomingContent.length === 0 ? (
              <div className="p-8 text-center text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.3)] rounded-xl border border-dashed border-[hsl(var(--border))]">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">{d.noContent}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingContent.slice(0, 6).map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.4)] transition-colors">
                    <div className="text-2xl flex-shrink-0">{PLATFORM_ICON[c.platform] || '📋'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm truncate">{c.title}</h4>
                        <span className="badge badge-secondary text-[10px]">{c.content_type}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))] mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {findClientName(c.client_id)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {c.publish_date} · {c.publish_time}
                        </span>
                      </div>
                    </div>
                    <span className={`badge text-[10px] ${
                      c.schedule_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      c.schedule_status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                      c.schedule_status === 'review' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{c.schedule_status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: MY CLIENTS & ACTIVITY */}
        <div className="space-y-6">

          <div className="premium-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" /> {d.myClients}
                </h2>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{d.myClientsSubtitle}</p>
              </div>
            </div>
            {enrichedClients.length === 0 ? (
              <div className="p-8 text-center text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.3)] rounded-xl border border-dashed border-[hsl(var(--border))]">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">{d.noClients}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {enrichedClients.map((c: any) => (
                  <Link key={c.id} href={`/clients/${c.id}`} className="block p-4 rounded-xl border border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)] hover:shadow-md transition-all group">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[hsl(var(--primary)/0.15)] to-purple-100 dark:to-purple-900/30 flex items-center justify-center text-sm font-black text-[hsl(var(--primary))] flex-shrink-0">
                        {c.company_name?.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate group-hover:text-[hsl(var(--primary))] transition-colors">{c.company_name}</p>
                            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{c.business_type || 'General'}</p>
                          </div>
                          <ArrowUpRight className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors flex-shrink-0" />
                        </div>
                        <div className="mt-2 space-y-1">
                          {c.email && (
                            <p className="text-[11px] text-[hsl(var(--muted-foreground))] flex items-center gap-1 truncate">
                              <Mail className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{c.email}</span>
                            </p>
                          )}
                          {c.phone && (
                            <p className="text-[11px] text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                              <Phone className="h-3 w-3 flex-shrink-0" /> {c.phone}
                            </p>
                          )}
                        </div>
                        {c.services.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {c.services.slice(0, 2).map((s: string) => (
                              <span key={s} className="badge badge-secondary text-[9px]">{s}</span>
                            ))}
                            {c.services.length > 2 && (
                              <span className="badge badge-secondary text-[9px]">+{c.services.length - 2}</span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dashed border-[hsl(var(--border))]">
                          {c.myPending > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              {c.myPending} {d.active}
                            </span>
                          )}
                          {c.myContent > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400">
                              {c.myContent} {d.pieces}
                            </span>
                          )}
                          {c.myPending === 0 && c.myContent === 0 && (
                            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">✓ {d.complete}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="premium-card p-5">
            <h2 className="font-bold text-base flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-indigo-500" /> {d.recentActivity}
            </h2>
            {notifications.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))] text-center py-6">{d.noActivity}</p>
            ) : (
              <div className="space-y-3">
                {notifications.slice(0, 5).map((n: any) => (
                  <div key={n.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-[hsl(var(--muted)/0.3)] transition-colors">
                    <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${n.is_read ? 'bg-gray-300' : 'bg-[hsl(var(--primary))]'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{n.title}</p>
                      {n.message && (
                        <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5 line-clamp-2">{n.message}</p>
                      )}
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                        {new Date(n.created_at).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

    </div>
  )
}
