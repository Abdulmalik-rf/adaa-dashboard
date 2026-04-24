'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Users, FileText, Bell, Plus, Clock, TrendingUp, CheckCircle2,
  ArrowRight, Activity, AlertCircle, Calendar, BarChart3,
  Zap, ShieldAlert, Target, Heart, TrendingDown,
  Briefcase, CheckSquare, UploadCloud, MessageSquare, Search,
  Filter, DollarSign, PieChart, Star, Mail, Phone, UserCheck
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'

const DICT = {
  en: {
    dashboard: "Executive Dashboard",
    subtitle: "Agency Command Center",
    quickActions: "Quick Actions",
    addClient: "Add Client",
    addTask: "Add Task",
    scheduleContent: "Schedule Content",
    uploadFile: "Upload File",
    addContract: "Add Contract",
    
    execSummary: "Executive Summary",
    totalClients: "Total Clients",
    activeRevenue: "Active Revenue",
    scheduledContent: "Content Queued",
    pendingTasks: "Pending Tasks",
    
    todayCommand: "Today Command Center",
    urgentAttention: "Requires Urgent Attention",
    dueToday: "Due Today",
    tasks: "Tasks",
    contracts: "Contracts",
    content: "Content",
    
    clientHealth: "Client Health & Portfolio Insight",
    healthy: "Healthy",
    needsAttention: "Needs Attention",
    atRisk: "At Risk",
    
    teamPerformance: "Team Workload & Performance",
    contentOps: "Content Operations Pipeline",
    financeIntel: "Financial Intelligence",
    approvalCenter: "Approval & Review Center",
    activityTimeline: "Platform Activity Timeline",
    
    searchPlaceholder: "Search clients, tasks, content, contracts...",
    viewAll: "View All",
    status: "Status",
    priority: "Priority"
  },
  ar: {
    dashboard: "لوحة القيادة التنفيذية",
    subtitle: "مركز التحكم والعمليات",
    quickActions: "إجراءات سريعة",
    addClient: "إضافة عميل",
    addTask: "إضافة مهمة",
    scheduleContent: "جدولة محتوى",
    uploadFile: "رفع ملف",
    addContract: "إضافة عقد",
    
    execSummary: "الملخص التنفيذي",
    totalClients: "إجمالي العملاء",
    activeRevenue: "العوائد النشطة",
    scheduledContent: "المحتوى المجدول",
    pendingTasks: "المهام المعلقة",
    
    todayCommand: "مركز عمل اليوم",
    urgentAttention: "يتطلب انتباهاً عاجلاً",
    dueToday: "مستحق اليوم",
    tasks: "المهام",
    contracts: "العقود",
    content: "المحتوى",
    
    clientHealth: "صحة العملاء وتحليل المحفظة",
    healthy: "مستقر",
    needsAttention: "يحتاج انتباه",
    atRisk: "في خطر",
    
    teamPerformance: "أداء الفريق وحجم العمل",
    contentOps: "عمليات وتشغيل المحتوى",
    financeIntel: "الذكاء المالي",
    approvalCenter: "مركز المراجعة والاعتمادات",
    activityTimeline: "السجل الزمني للنشاط",
    
    searchPlaceholder: "ابحث عن عملاء، مهام، محتوى، عقود...",
    viewAll: "عرض الكل",
    status: "الحالة",
    priority: "الأولوية"
  }
}

export function DashboardClient({ 
  clients, contracts, tasks, teamMembers, contentItems, reminders, notifications, campaigns 
}: any) {
  const { language, dir } = useLanguage()
  const d = DICT[language as 'en' | 'ar'] || DICT.en
  const [searchQuery, setSearchQuery] = useState('')

  const today = new Date().toISOString().split('T')[0]

  // 1. Executive Summary Metrics
  const activeClients = clients?.filter((c:any) => c.status === 'active') || []
  const clientsToContact = clients?.filter((c:any) => c.status === 'to_contact') || []
  const monthlyRevenue = contracts?.filter((c:any) => c.status === 'active').reduce((sum:number, c:any) => sum + (c.value || 0), 0) || 0
  const pendingTasks = tasks?.filter((t:any) => t.status !== 'completed') || []
  const scheduledQueued = contentItems?.filter((c:any) => ['scheduled', 'approved', 'draft'].includes(c.schedule_status)) || []
  
  // 2. Today Command Center
  const overdueTasks = pendingTasks.filter((t:any) => t.due_date < today)
  const dueTodayTasks = pendingTasks.filter((t:any) => t.due_date === today)
  const contentToday = contentItems?.filter((c:any) => c.publish_date === today) || []
  const urgentReminders = reminders?.filter((r:any) => r.is_urgent && !r.is_completed) || []
  const expiringContracts = contracts?.filter((c:any) => c.status === 'ending_soon') || []

  // 3. Client Health Score
  const clientHealth = useMemo(() => {
    return clients?.map((client: any) => {
      let score = 100
      const clientTasks = pendingTasks.filter((t:any) => t.client_id === client.id)
      const overdue = clientTasks.filter((t:any) => t.due_date < today).length
      score -= (overdue * 5)
      
      const clientContract = contracts?.find((c:any) => c.client_id === client.id)
      if (!clientContract) score -= 20
      else if (clientContract.status === 'ending_soon') score -= 15
      else if (clientContract.status === 'expired') score -= 30

      const recentContent = contentItems?.filter((c:any) => c.client_id === client.id).length || 0
      if (recentContent === 0) score -= 10

      if (client.status === 'paused') score -= 20

      score = Math.max(0, Math.min(100, score))
      
      let status = 'healthy'
      if (score < 60) status = 'atRisk'
      else if (score < 85) status = 'needsAttention'

      return { ...client, healthScore: score, healthStatus: status }
    }).sort((a:any, b:any) => a.healthScore - b.healthScore) || []
  }, [clients, pendingTasks, contracts, contentItems, today])

  // 4. Team Performance
  const teamWorkload = useMemo(() => {
    return teamMembers?.map((team: any) => {
      const assigned = pendingTasks.filter((t:any) => t.assignee_id === team.id)
      const overdue = assigned.filter((t:any) => t.due_date < today).length
      const completedToday = tasks?.filter((t:any) => t.assignee_id === team.id && t.status === 'completed' && t.updated_at?.startsWith(today)).length || 0
      return { ...team, taskCount: assigned.length, overdue, completedToday }
    }).sort((a:any, b:any) => b.taskCount - a.taskCount) || []
  }, [teamMembers, pendingTasks, tasks, today])

  // Chart Data
  const revenueChartData = [
    { name: 'W1', value: monthlyRevenue * 0.2 }, { name: 'W2', value: monthlyRevenue * 0.45 },
    { name: 'W3', value: monthlyRevenue * 0.7 }, { name: 'W4', value: monthlyRevenue * 1.05 }
  ]

  // Approvals
  const reviewContent = contentItems?.filter((c:any) => c.schedule_status === 'review') || []
  const reviewTasks = pendingTasks?.filter((t:any) => t.status === 'review') || []

  return (
    <div className="space-y-6 pb-20">
      
      {/* HEADER & SEARCH */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[hsl(var(--primary))] flex items-center gap-3">
             <Zap className="h-6 w-6" /> {d.dashboard}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] font-medium mt-1">{d.subtitle}</p>
        </div>
        <div className="flex w-full md:w-auto items-center gap-3">
           <div className="relative w-full md:w-72">
             <Search className={`absolute ${dir === 'rtl' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]`} />
             <input type="text" placeholder={d.searchPlaceholder} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className={`form-input w-full ${dir === 'rtl' ? 'pr-9' : 'pl-9'} rounded-full bg-[hsl(var(--card))] border-[hsl(var(--border))] focus:border-[hsl(var(--primary))] text-sm shadow-sm`} />
           </div>
           <button className="btn btn-secondary rounded-full h-10 w-10 p-0 flex items-center justify-center flex-shrink-0 shadow-sm">
             <Filter className="h-4 w-4" />
           </button>
        </div>
      </div>

      {/* QUICK ACTIONS BAR */}
      <div className="flex flex-wrap gap-3">
         {[
           { icon: Users, label: d.addClient, href: '/clients/new', color: 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white border-emerald-200 dark:border-emerald-900' },
           { icon: CheckSquare, label: d.addTask, href: '/tasks', color: 'bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white border-blue-200 dark:border-blue-900' },
           { icon: UploadCloud, label: d.uploadFile, href: '/files', color: 'bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white border-amber-200 dark:border-amber-900' },
           { icon: FileText, label: d.addContract, href: '/contracts', color: 'bg-purple-500/10 text-purple-600 hover:bg-purple-500 hover:text-white border-purple-200 dark:border-purple-900' },
         ].map((qa, i) => (
           <Link key={i} href={qa.href} className={`flex items-center gap-2 px-4 py-2.5 rounded-full border transition-all shadow-sm font-semibold text-xs ${qa.color} flex-auto justify-center sm:flex-none`}>
              <qa.icon className="h-4 w-4" /> {qa.label}
           </Link>
         ))}
      </div>

      {/* CLIENTS TO CONTACT — captured leads awaiting outreach (populated by the WhatsApp agent from business cards) */}
      {clientsToContact.length > 0 && (
        <div className="premium-card border-l-4 border-l-pink-500 overflow-hidden">
          <div className="p-5 bg-gradient-to-r from-pink-500/5 to-transparent flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-pink-500" /> Clients to Contact
              </h2>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                {clientsToContact.length} new {clientsToContact.length === 1 ? 'contact' : 'contacts'} captured, awaiting outreach
              </p>
            </div>
            <Link href="/clients?status=to_contact" className="text-xs font-bold text-pink-600 hover:underline whitespace-nowrap">
              View All →
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5 pt-0">
            {clientsToContact.slice(0, 6).map((c: any) => (
              <Link key={c.id} href={`/clients/${c.id}`}>
                <div className="p-4 rounded-xl border border-pink-200/50 dark:border-pink-900/40 hover:border-pink-500 hover:shadow-md transition-all bg-pink-50/30 dark:bg-pink-900/5 h-full">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-pink-500/10 text-pink-600 flex items-center justify-center font-black text-sm flex-shrink-0">
                      {c.company_name?.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{c.company_name}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{c.full_name || '—'}</p>
                      <div className="flex flex-col gap-0.5 mt-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                        {c.phone && <span className="flex items-center gap-1 truncate"><Phone className="h-3 w-3 flex-shrink-0" />{c.phone}</span>}
                        {c.email && <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 flex-shrink-0" />{c.email}</span>}
                        {c.city && <span className="flex items-center gap-1 truncate">📍 {c.city}</span>}
                      </div>
                      {c.notes && (
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-2 line-clamp-2 italic">{c.notes}</p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* EXECUTIVE SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="premium-card p-5 bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--muted)/0.5)] border-l-4 border-l-blue-500">
           <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{d.totalClients}</span><Users className="h-4 w-4 text-blue-500" /></div>
           <div className="text-3xl font-black">{activeClients.length} <span className="text-sm font-medium text-[hsl(var(--muted-foreground))] font-normal">/ {clients?.length || 0}</span></div>
        </div>
        <div className="premium-card p-5 bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--muted)/0.5)] border-l-4 border-l-emerald-500">
           <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{d.activeRevenue}</span><DollarSign className="h-4 w-4 text-emerald-500" /></div>
           <div className="text-3xl font-black">{monthlyRevenue.toLocaleString()} <span className="text-xs text-[hsl(var(--muted-foreground))]">SAR/mo</span></div>
        </div>
        <div className="premium-card p-5 bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--muted)/0.5)] border-l-4 border-l-amber-500">
           <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{d.pendingTasks}</span><Activity className="h-4 w-4 text-amber-500" /></div>
           <div className="text-3xl font-black">{pendingTasks.length} <span className="text-[10px] text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-full">{overdueTasks.length} overdue</span></div>
        </div>
        <div className="premium-card p-5 bg-gradient-to-br from-[hsl(var(--card))] to-[hsl(var(--muted)/0.5)] border-l-4 border-l-pink-500">
           <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{d.scheduledContent}</span><Calendar className="h-4 w-4 text-pink-500" /></div>
           <div className="text-3xl font-black">{scheduledQueued.length} <span className="text-sm text-[hsl(var(--muted-foreground))] font-normal">items</span></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: COMMAND & OPS */}
        <div className="lg:col-span-2 space-y-6">
           
           {/* TODAY COMMAND CENTER */}
           <div className="premium-card overflow-hidden border-indigo-200 dark:border-indigo-900/50 shadow-lg shadow-indigo-500/5">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white flex justify-between items-center">
                 <div>
                   <h2 className="text-xl font-bold flex items-center gap-2"><Target className="h-5 w-5" /> {d.todayCommand}</h2>
                   <p className="text-indigo-100 text-xs mt-1 font-medium">{new Date().toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                 </div>
                 <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm"><Zap className="h-6 w-6 text-white" /></div>
              </div>
              
              <div className="p-5 space-y-6 bg-white dark:bg-[hsl(var(--card))]">
                 {/* Urgent Attention Row */}
                 {(overdueTasks.length > 0 || expiringContracts.length > 0 || urgentReminders.length > 0) && (
                   <div>
                     <h3 className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">{d.urgentAttention}</h3>
                     <div className="flex flex-col gap-2">
                        {expiringContracts.map((c:any) => (
                           <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 text-sm">
                             <div className="flex items-center gap-3"><AlertCircle className="h-4 w-4 text-red-600" /><span className="font-semibold text-red-900 dark:text-red-400">Contract Expiring: {c.title}</span></div>
                             <Link href="/contracts" className="text-red-600 text-xs font-bold hover:underline">Action →</Link>
                           </div>
                        ))}
                        {overdueTasks.slice(0,3).map((t:any) => (
                           <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 text-sm">
                             <div className="flex items-center gap-3"><Clock className="h-4 w-4 text-orange-600" /><span className="font-semibold text-orange-900 dark:text-orange-400">Overdue Task: {t.title}</span></div>
                             <span className="text-orange-600 text-xs font-bold">{t.due_date}</span>
                           </div>
                        ))}
                     </div>
                   </div>
                 )}

                 {/* Focus Today Grid */}
                 <div>
                    <h3 className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">{d.dueToday} / Focus</h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                       <div className="p-4 rounded-xl border border-[hsl(var(--border))]">
                          <div className="flex justify-between items-center mb-4"><span className="font-bold">{d.tasks}</span><span className="bg-[hsl(var(--primary))] text-white text-xs px-2 py-0.5 rounded-full">{dueTodayTasks.length}</span></div>
                          <div className="space-y-2">
                             {dueTodayTasks.length === 0 ? <p className="text-xs text-[hsl(var(--muted-foreground))]">All caught up.</p> : 
                              dueTodayTasks.slice(0,3).map((t:any) => (
                                <div key={t.id} className="text-sm flex items-start gap-2"><div className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" /><span className="truncate">{t.title}</span></div>
                              ))
                             }
                          </div>
                          <Link href="/tasks" className="text-xs text-[hsl(var(--primary))] font-bold hover:underline mt-3 inline-block">Go to Tasks →</Link>
                       </div>
                       <div className="p-4 rounded-xl border border-[hsl(var(--border))]">
                          <div className="flex justify-between items-center mb-4"><span className="font-bold">{d.content}</span><span className="bg-pink-500 text-white text-xs px-2 py-0.5 rounded-full">{contentToday.length}</span></div>
                          <div className="space-y-2">
                             {contentToday.length === 0 ? <p className="text-xs text-[hsl(var(--muted-foreground))]">No posts scheduled.</p> : 
                              contentToday.slice(0,3).map((c:any) => (
                                <div key={c.id} className="text-sm flex items-start gap-2"><div className="mt-1 h-1.5 w-1.5 rounded-full bg-pink-500 flex-shrink-0" /><span className="truncate">{c.title}</span></div>
                              ))
                             }
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
           </div>

           {/* CONTENT OPS & TEAM PERF ROW */}
           <div className="grid md:grid-cols-2 gap-6">
              {/* Client Health Radar */}
              <div className="premium-card p-5">
                 <h2 className="font-bold text-base flex items-center gap-2 mb-4"><Heart className="h-4 w-4" /> {d.clientHealth}</h2>
                 <div className="space-y-4">
                    {clientHealth.slice(0, 5).map((c:any) => (
                      <div key={c.id} className="space-y-1">
                         <div className="flex justify-between items-center text-sm">
                            <span className="font-semibold truncate max-w-[150px]">{c.company_name}</span>
                            <span className={`font-bold ${c.healthStatus === 'healthy' ? 'text-emerald-500' : c.healthStatus === 'needsAttention' ? 'text-amber-500' : 'text-red-500'}`}>{c.healthScore}/100</span>
                         </div>
                         <div className="h-1.5 w-full bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                            <div className={`h-full ${c.healthStatus === 'healthy' ? 'bg-emerald-500' : c.healthStatus === 'needsAttention' ? 'bg-amber-500' : 'bg-red-500'}`} style={{width: `${c.healthScore}%`}}></div>
                         </div>
                      </div>
                    ))}
                    <div className="pt-2 text-center">
                      <Link href="/clients" className="text-xs text-[hsl(var(--primary))] font-bold hover:underline">Full Portfolio Report →</Link>
                    </div>
                 </div>
              </div>

              {/* Team Workload */}
              <div className="premium-card p-5">
                 <h2 className="font-bold text-base flex items-center gap-2 mb-4"><Users className="h-4 w-4" /> {d.teamPerformance}</h2>
                 <div className="space-y-3">
                    {teamWorkload.slice(0, 5).map((tm:any) => (
                      <div key={tm.id} className="flex justify-between items-center p-2 hover:bg-[hsl(var(--muted)/0.3)] rounded-lg transition-colors">
                         <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-[hsl(var(--primary)/0.1)] flex items-center justify-center text-xs font-bold text-[hsl(var(--primary))]">{tm.full_name?.substring(0,2).toUpperCase()}</div>
                            <div>
                               <p className="text-sm font-semibold">{tm.full_name}</p>
                               <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{tm.completedToday} done today</p>
                            </div>
                         </div>
                         <div className="text-right">
                            <p className="text-xs font-bold bg-[hsl(var(--muted))] px-2 py-1 rounded-md">{tm.taskCount} active</p>
                            {tm.overdue > 0 && <p className="text-[10px] text-red-500 font-bold mt-1">{tm.overdue} overdue!</p>}
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
           </div>

           {/* FINANCE INTELLIGENCE */}
           <div className="premium-card p-5">
              <h2 className="font-bold text-base flex items-center gap-2 mb-4"><PieChart className="h-4 w-4" /> {d.financeIntel}</h2>
              <div className="grid md:grid-cols-4 gap-4">
                 <div className="md:col-span-3">
                    <ResponsiveContainer width="100%" height={200}>
                       <AreaChart data={revenueChartData}>
                         <defs>
                           <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                             <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                           </linearGradient>
                         </defs>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                         <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                         <YAxis hide />
                         <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', background: 'hsl(var(--card))' }} />
                         <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                       </AreaChart>
                    </ResponsiveContainer>
                 </div>
                 <div className="flex flex-col justify-center space-y-4 border-l border-[hsl(var(--border))] border-dashed pl-4">
                    <div>
                       <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-bold text-emerald-500">Projected MRR</p>
                       <p className="text-xl font-black mt-1">{(monthlyRevenue * 1.05).toLocaleString()} SAR</p>
                    </div>
                    <div>
                       <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-bold text-amber-500">Est. Ad Spend</p>
                       <p className="text-xl font-black mt-1">{(campaigns?.reduce((sum:number, c:any)=>sum+c.spent,0)||0).toLocaleString()} SAR</p>
                    </div>
                    <Link href="/finance" className="btn btn-outline text-xs mt-2 w-full justify-center">Finance OS</Link>
                 </div>
              </div>
           </div>

        </div>

        {/* RIGHT COLUMN: INTELLIGENCE & REVIEWS */}
        <div className="space-y-6">
           

           {/* APPROVAL CENTER */}
           <div className="premium-card p-5">
              <h2 className="font-bold text-base flex items-center gap-2 mb-4"><CheckCircle2 className="h-4 w-4 text-blue-500" /> {d.approvalCenter}</h2>
              <div className="space-y-3">
                 {reviewContent.length === 0 && reviewTasks.length === 0 ? (
                    <div className="p-8 text-center text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.3)] rounded-xl border border-dashed border-[hsl(var(--border))]">
                       <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
                       <p className="text-sm font-medium">Inbox Zero. All clear!</p>
                    </div>
                 ) : (
                    <>
                       {reviewContent.map((c:any) => (
                           <div key={c.id} className="flex justify-between items-center p-3 border border-[hsl(var(--border))] rounded-lg">
                              <span className="text-sm font-semibold truncate max-w-[140px]">{c.title}</span>
                              <span className="badge bg-indigo-100 text-indigo-800 text-[10px]">Content Review</span>
                           </div>
                       ))}
                       {reviewTasks.map((t:any) => (
                           <div key={t.id} className="flex justify-between items-center p-3 border border-[hsl(var(--border))] rounded-lg">
                              <span className="text-sm font-semibold truncate max-w-[140px]">{t.title}</span>
                              <span className="badge bg-orange-100 text-orange-800 text-[10px]">Task Review</span>
                           </div>
                       ))}
                    </>
                 )}
              </div>
           </div>

           {/* ACTIVITY TIMELINE */}
           <div className="premium-card p-5">
              <h2 className="font-bold text-base flex items-center gap-2 mb-4"><Activity className="h-4 w-4" /> {d.activityTimeline}</h2>
              <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[hsl(var(--border))] before:to-transparent">
                 {notifications?.slice(0,5).map((n:any, i:number) => (
                    <div key={n.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active py-2">
                       <div className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-white bg-blue-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 mx-3"></div>
                       <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm transition-all hover:border-[hsl(var(--primary))]">
                          <div className="flex items-center justify-between mb-1">
                             <time className="text-[10px] text-[hsl(var(--muted-foreground))]">{new Date(n.created_at).toLocaleDateString()}</time>
                          </div>
                          <div className="text-xs font-semibold text-[hsl(var(--foreground))] truncate">{n.title}</div>
                       </div>
                    </div>
                 ))}
                 {(!notifications || notifications.length === 0) && (
                    <div className="text-center text-xs text-[hsl(var(--muted-foreground))] py-6">No recent activity</div>
                 )}
              </div>
           </div>

        </div>
      </div>
      
    </div>
  )
}
