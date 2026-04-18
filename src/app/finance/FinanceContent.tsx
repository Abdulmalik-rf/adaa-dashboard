'use client'

import React, { useState, useMemo } from 'react'
import {
  DollarSign, TrendingUp, TrendingDown, AlertCircle, ArrowUpRight,
  Wallet, BarChart3, Download, Filter, Star, AlertTriangle,
  CheckCircle, Target, PieChart as PieChartIcon, Zap
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6']

interface FinanceContentProps {
  contracts: any[]
  clients: any[]
  campaigns: any[]
  contentItems: any[]
}

export function FinanceContent({ contracts, clients, campaigns, contentItems }: FinanceContentProps) {
  const { dir, language } = useLanguage()
  const [activeTab, setActiveTab] = useState<'overview' | 'clients' | 'expenses' | 'campaigns'>('overview')
  const isAr = language === 'ar'

  // ── Core Financial Calculations from REAL data ─────────────────────────────
  const metrics = useMemo(() => {
    const activeContracts = contracts.filter(c => c.status === 'active')
    const totalRevenue = activeContracts.reduce((s, c) => s + (c.value || 0), 0)
    const recurringRevenue = activeContracts.filter(c => c.contract_type === 'retainer').reduce((s, c) => s + (c.value || 0), 0)
    const oneTimeRevenue = totalRevenue - recurringRevenue

    const totalAdSpend = campaigns.reduce((s, c) => s + (c.spent || 0), 0)
    const totalAdBudget = campaigns.reduce((s, c) => s + (c.budget || 0), 0)

    // Estimate expenses: ad spend + overhead estimate
    const estimatedOverhead = totalRevenue * 0.28
    const totalExpenses = totalAdSpend + estimatedOverhead
    const netProfit = totalRevenue - totalExpenses
    const margin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0

    const expiringContracts = contracts.filter(c => c.status === 'ending_soon')

    return { totalRevenue, recurringRevenue, oneTimeRevenue, totalAdSpend, totalAdBudget, estimatedOverhead, totalExpenses, netProfit, margin, expiringContracts }
  }, [contracts, campaigns])

  // ── Client Profitability ───────────────────────────────────────────────────
  const clientProfitability = useMemo(() => {
    return clients.map(client => {
      const clientContracts = contracts.filter(c => c.client_id === client.id && c.status === 'active')
      const revenue = clientContracts.reduce((s, c) => s + (c.value || 0), 0)
      const clientCampaigns = campaigns.filter(c => c.client_id === client.id)
      const adSpend = clientCampaigns.reduce((s, c) => s + (c.spent || 0), 0)
      const costs = adSpend + revenue * 0.22
      const profit = revenue - costs
      const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0
      return { ...client, revenue, adSpend, profit, margin, contractCount: clientContracts.length }
    })
      .filter(c => c.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
  }, [clients, contracts, campaigns])

  // ── Revenue Trend (monthly simulation from contract values) ─────────────────
  const revenueTrend = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const base = metrics.totalRevenue
    return months.slice(0, 8).map((name, i) => ({
      name,
      revenue: Math.round(base * (0.6 + i * 0.06 + Math.sin(i) * 0.04)),
      expenses: Math.round(base * (0.4 + i * 0.03 + Math.sin(i + 1) * 0.02)),
    }))
  }, [metrics.totalRevenue])

  // ── Expense Breakdown ──────────────────────────────────────────────────────
  const expenseBreakdown = useMemo(() => [
    { name: isAr ? 'رواتب' : 'Salaries',    value: Math.round(metrics.estimatedOverhead * 0.52), color: COLORS[0] },
    { name: isAr ? 'إعلانات' : 'Ad Spend',  value: Math.round(metrics.totalAdSpend),             color: COLORS[1] },
    { name: isAr ? 'برمجيات' : 'Software',  value: Math.round(metrics.estimatedOverhead * 0.1),  color: COLORS[2] },
    { name: isAr ? 'تشغيل' : 'Operations', value: Math.round(metrics.estimatedOverhead * 0.25),  color: COLORS[3] },
    { name: isAr ? 'أخرى' : 'Other',       value: Math.round(metrics.estimatedOverhead * 0.13),  color: COLORS[4] },
  ], [metrics, isAr])

  // ── Alerts ─────────────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const list: { type: string; title: string; desc: string }[] = []
    if (metrics.expiringContracts.length > 0)
      list.push({ type: 'urgent', title: isAr ? 'عقود توشك على الانتهاء' : 'Contracts Expiring Soon', desc: `${metrics.expiringContracts.length} ${isAr ? 'عقد يحتاج تجديد فوري' : 'contracts require renewal action'}` })
    const lowMarginClients = clientProfitability.filter(c => c.margin > 0 && c.margin < 40)
    if (lowMarginClients.length > 0)
      list.push({ type: 'warning', title: isAr ? 'عملاء بهامش منخفض' : 'Low-Margin Clients', desc: `${lowMarginClients.map(c => c.company_name).join(', ')}` })
    if (metrics.totalAdSpend > metrics.totalAdBudget * 0.85)
      list.push({ type: 'warning', title: isAr ? 'تجاوز ميزانية الإعلانات' : 'Ad Budget Overspending Alert', desc: isAr ? 'الإنفاق الإعلاني يتجاوز 85% من الميزانية' : 'Ad spend is above 85% of budget' })
    if (metrics.margin < 25)
      list.push({ type: 'warning', title: isAr ? 'هامش الربح منخفض' : 'Low Profit Margin', desc: isAr ? 'هامش الربح أقل من 25% — راجع التسعير' : 'Profit margin below 25% — review pricing strategy' })
    if (list.length === 0)
      list.push({ type: 'success', title: isAr ? 'الوضع المالي مستقر' : 'Financial Status: Stable', desc: isAr ? 'لا توجد تحذيرات مالية حالياً' : 'No critical financial warnings at this time' })
    return list
  }, [metrics, clientProfitability, isAr])

  const fmt = (n: number) => n.toLocaleString('en-SA')
  const tabClass = (tab: string) =>
    `px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab ? 'bg-[hsl(var(--primary))] text-white shadow-md' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)]'}`

  return (
    <div className="space-y-6 pb-16 animate-fade-in">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <DollarSign className="h-7 w-7 text-emerald-500" />
            {isAr ? 'المالية والذكاء المالي' : 'Finance Intelligence'}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium">
            {isAr ? 'رؤية مالية استراتيجية متكاملة للوكالة' : 'Full-spectrum financial visibility for agency operations'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-secondary btn-sm flex items-center gap-2">
            <Filter className="h-4 w-4" /> {isAr ? 'تصفية' : 'Filter'}
          </button>
          <button className="btn btn-secondary btn-sm flex items-center gap-2">
            <Download className="h-4 w-4" /> {isAr ? 'تصدير PDF' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* EXECUTIVE KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: isAr ? 'إجمالي الإيرادات' : 'Total Revenue',  value: `${fmt(metrics.totalRevenue)} SAR`, icon: TrendingUp,  color: 'border-l-emerald-500 text-emerald-500', bg: 'from-emerald-500/5' },
          { label: isAr ? 'إجمالي المصاريف' : 'Total Expenses', value: `${fmt(Math.round(metrics.totalExpenses))} SAR`, icon: Wallet,      color: 'border-l-amber-500 text-amber-500',   bg: 'from-amber-500/5' },
          { label: isAr ? 'صافي الربح' : 'Net Profit',         value: `${fmt(Math.round(metrics.netProfit))} SAR`, icon: DollarSign, color: 'border-l-blue-500 text-blue-500',     bg: 'from-blue-500/5' },
          { label: isAr ? 'هامش الربح' : 'Profit Margin',      value: `${metrics.margin}%`,                       icon: PieChartIcon, color: 'border-l-purple-500 text-purple-500', bg: 'from-purple-500/5' },
        ].map((kpi, i) => (
          <div key={i} className={`premium-card p-5 border-l-4 ${kpi.color} bg-gradient-to-br ${kpi.bg} to-transparent`}>
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{kpi.label}</span>
              <kpi.icon className={`h-4 w-4 ${kpi.color.split(' ')[1]}`} />
            </div>
            <p className="text-2xl font-black">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* SECONDARY KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: isAr ? 'إيرادات متكررة' : 'Recurring Revenue', value: `${fmt(metrics.recurringRevenue)} SAR`, color: 'text-emerald-600' },
          { label: isAr ? 'إيرادات لمرة واحدة' : 'One-Time Revenue', value: `${fmt(metrics.oneTimeRevenue)} SAR`, color: 'text-blue-600' },
          { label: isAr ? 'إنفاق إعلاني' : 'Total Ad Spend',   value: `${fmt(Math.round(metrics.totalAdSpend))} SAR`, color: 'text-amber-600' },
          { label: isAr ? 'حملات نشطة' : 'Active Campaigns',   value: campaigns.filter(c => c.status === 'active').length.toString(), color: 'text-purple-600' },
        ].map((s, i) => (
          <div key={i} className="premium-card p-4 flex justify-between items-center hover:shadow-md transition-shadow">
            <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{s.label}</span>
            <span className={`text-sm font-black ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'overview',  label: isAr ? 'نظرة عامة' : 'Overview' },
          { key: 'clients',   label: isAr ? 'ربحية العملاء' : 'Client Profitability' },
          { key: 'expenses',  label: isAr ? 'تحليل المصاريف' : 'Expense Analysis' },
          { key: 'campaigns', label: isAr ? 'الحملات الإعلانية' : 'Ad Campaigns' },
        ].map(tab => (
          <button key={tab.key} className={tabClass(tab.key)} onClick={() => setActiveTab(tab.key as any)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Revenue vs Expenses Chart */}
            <div className="lg:col-span-2 premium-card p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg">{isAr ? 'الإيرادات مقابل المصاريف' : 'Revenue vs Expenses'}</h3>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{isAr ? 'مقارنة شهرية للسنة الحالية' : 'Monthly comparison for current year'}</p>
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full">+{metrics.margin}% margin</span>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={revenueTrend}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.4)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px' }} formatter={(v: any) => [`${Number(v).toLocaleString()} SAR`]} />
                  <Area type="monotone" dataKey="revenue" name={isAr ? 'الإيرادات' : 'Revenue'} stroke="#10b981" strokeWidth={2.5} fill="url(#gRev)" />
                  <Area type="monotone" dataKey="expenses" name={isAr ? 'المصاريف' : 'Expenses'} stroke="#f59e0b" strokeWidth={2.5} fill="url(#gExp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Alerts */}
            <div className="premium-card p-6 space-y-4">
              <h3 className="font-bold text-lg flex items-center gap-2"><Zap className="h-5 w-5 text-amber-500" /> {isAr ? 'تنبيهات مالية' : 'Financial Alerts'}</h3>
              {alerts.map((a, i) => (
                <div key={i} className={`p-4 rounded-xl border text-sm ${
                  a.type === 'urgent' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' :
                  a.type === 'warning' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30' :
                  'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/30'
                }`}>
                  <p className="font-bold text-xs mb-1 flex items-center gap-1.5">
                    {a.type === 'urgent' ? <AlertCircle className="h-3.5 w-3.5 text-red-500" /> :
                     a.type === 'warning' ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> :
                     <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                    {a.title}
                  </p>
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">{a.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Expense Breakdown */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="premium-card p-6">
              <h3 className="font-bold text-lg mb-4">{isAr ? 'توزيع المصاريف' : 'Expense Distribution'}</h3>
              <div className="flex flex-col md:flex-row items-center gap-6">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={expenseBreakdown} innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                      {expenseBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2.5">
                  {expenseBreakdown.map((ex, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: ex.color }} />
                        <span className="font-medium">{ex.name}</span>
                      </div>
                      <span className="font-bold text-[hsl(var(--muted-foreground))]">{fmt(ex.value)} SAR</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Budget Usage */}
            <div className="premium-card p-6">
              <h3 className="font-bold text-lg mb-4">{isAr ? 'استخدام ميزانية الإعلانات' : 'Ad Budget Usage'}</h3>
              <div className="space-y-4">
                {campaigns.slice(0, 5).map((c: any, i: number) => {
                  const pct = c.budget > 0 ? Math.min(100, Math.round((c.spent / c.budget) * 100)) : 0
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="truncate max-w-[200px]">{c.name}</span>
                        <span className={pct > 85 ? 'text-red-500 font-bold' : 'text-[hsl(var(--muted-foreground))]'}>{pct}%</span>
                      </div>
                      <div className="h-2 w-full bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
                        <span>{fmt(c.spent || 0)} SAR spent</span>
                        <span>{fmt(c.budget || 0)} SAR budget</span>
                      </div>
                    </div>
                  )
                })}
                {campaigns.length === 0 && <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-6">{isAr ? 'لا توجد حملات نشطة' : 'No active campaigns'}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CLIENT PROFITABILITY TAB ─────────────────────────────────────────── */}
      {activeTab === 'clients' && (
        <div className="premium-card overflow-hidden animate-fade-in">
          <div className="p-6 border-b border-[hsl(var(--border))] flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">{isAr ? 'تحليل ربحية العملاء' : 'Client Profitability Analysis'}</h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{isAr ? 'مرتبة حسب الإيرادات' : 'Sorted by revenue contribution'}</p>
            </div>
            <Star className="h-5 w-5 text-amber-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'العميل' : 'Client'}</th>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'الإيرادات' : 'Revenue'}</th>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'الإنفاق الإعلاني' : 'Ad Spend'}</th>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'الربح' : 'Profit'}</th>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'الهامش' : 'Margin'}</th>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {clientProfitability.map((c: any, i: number) => (
                  <tr key={c.id} className="group">
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] flex items-center justify-center text-xs font-bold">
                          {c.company_name?.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold">{c.company_name}</p>
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{c.contractCount} {isAr ? 'عقد' : 'contracts'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="font-bold text-emerald-500">{fmt(c.revenue)} SAR</td>
                    <td className="text-amber-500 font-semibold">{fmt(Math.round(c.adSpend))} SAR</td>
                    <td className={`font-bold ${c.profit >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                      {c.profit >= 0 ? '+' : ''}{fmt(Math.round(c.profit))} SAR
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.margin > 60 ? 'bg-emerald-500' : c.margin > 35 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.max(0, c.margin)}%` }} />
                        </div>
                        <span className={`text-xs font-bold ${c.margin > 60 ? 'text-emerald-500' : c.margin > 35 ? 'text-amber-500' : 'text-red-500'}`}>{c.margin}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge text-[10px] ${c.status === 'active' ? 'badge-active' : 'badge-secondary'}`}>{c.status}</span>
                    </td>
                  </tr>
                ))}
                {clientProfitability.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-[hsl(var(--muted-foreground))]">{isAr ? 'لا توجد بيانات مالية للعملاء' : 'No client financial data available'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── EXPENSES TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'expenses' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="premium-card p-6">
              <h3 className="font-bold text-lg mb-4">{isAr ? 'تصنيف المصاريف' : 'Expense Categories'}</h3>
              <div className="space-y-4">
                {expenseBreakdown.map((ex, i) => {
                  const total = expenseBreakdown.reduce((s, e) => s + e.value, 0)
                  const pct = total > 0 ? Math.round((ex.value / total) * 100) : 0
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: ex.color }} />
                          {ex.name}
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold">{fmt(ex.value)} SAR</span>
                          <span className="text-[10px] text-[hsl(var(--muted-foreground))] ml-2">({pct}%)</span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ex.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="premium-card p-6">
              <h3 className="font-bold text-lg mb-4">{isAr ? 'ملخص تنفيذي' : 'Executive Summary'}</h3>
              <div className="space-y-3">
                {[
                  { label: isAr ? 'إجمالي الإيرادات' : 'Total Revenue', value: `${fmt(metrics.totalRevenue)} SAR`, positive: true },
                  { label: isAr ? 'إجمالي المصاريف' : 'Total Expenses', value: `${fmt(Math.round(metrics.totalExpenses))} SAR`, positive: false },
                  { label: isAr ? 'صافي الربح' : 'Net Profit', value: `${fmt(Math.round(metrics.netProfit))} SAR`, positive: metrics.netProfit >= 0 },
                  { label: isAr ? 'هامش الربح' : 'Profit Margin', value: `${metrics.margin}%`, positive: metrics.margin > 30 },
                ].map((row, i) => (
                  <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-[hsl(var(--muted)/0.3)] hover:bg-[hsl(var(--muted)/0.5)] transition-colors">
                    <span className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">{row.label}</span>
                    <span className={`text-base font-black ${row.positive ? 'text-emerald-500' : 'text-amber-500'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CAMPAIGNS TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'campaigns' && (
        <div className="premium-card overflow-hidden animate-fade-in">
          <div className="p-6 border-b border-[hsl(var(--border))] flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center gap-2"><Target className="h-5 w-5 text-blue-500" /> {isAr ? 'أداء الحملات الإعلانية' : 'Ad Campaign Performance'}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'الحملة' : 'Campaign'}</th>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'الميزانية' : 'Budget'}</th>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'الإنفاق' : 'Spent'}</th>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'النقرات' : 'Clicks'}</th>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'التحويلات' : 'Conversions'}</th>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>CTR</th>
                  <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>{isAr ? 'الاستخدام' : 'Usage'}</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c: any) => {
                  const pct = c.budget > 0 ? Math.min(100, Math.round((c.spent / c.budget) * 100)) : 0
                  const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : '0.00'
                  return (
                    <tr key={c.id} className="group">
                      <td className="font-semibold">{c.name}</td>
                      <td>{fmt(c.budget || 0)} SAR</td>
                      <td className="font-bold">{fmt(c.spent || 0)} SAR</td>
                      <td>{(c.clicks || 0).toLocaleString()}</td>
                      <td className="text-emerald-500 font-bold">{c.conversions || 0}</td>
                      <td className={parseFloat(ctr) > 1 ? 'text-emerald-500 font-bold' : 'text-amber-500'}>{ctr}%</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-14 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                            <div className={`h-full ${pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-bold">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {campaigns.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-[hsl(var(--muted-foreground))]">{isAr ? 'لا توجد حملات' : 'No campaigns found'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
