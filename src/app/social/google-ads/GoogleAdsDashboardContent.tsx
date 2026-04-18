'use client'

import React, { useState } from 'react'
import { 
  Target, TrendingUp, Users, MousePointer2, CreditCard, Wallet, 
  BarChart3, Layout, Edit3, Settings, MoreHorizontal, ArrowUpRight,
  ShieldCheck, Share2, Timer, Search, PieChart as PieChartIcon,
  Filter
} from 'lucide-react'
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts'
import { AnalyticsCard } from '@/components/dashboard/AnalyticsCard'
import { ChartPanel } from '@/components/dashboard/ChartPanel'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SocialContentCreator } from '@/components/social/SocialContentCreator'

const MOCK_CPC_HISTORY = [
  { day: 'Mon', cpc: 2.4 },
  { day: 'Tue', cpc: 2.1 },
  { day: 'Wed', cpc: 2.8 },
  { day: 'Thu', cpc: 2.2 },
  { day: 'Fri', cpc: 1.9 },
  { day: 'Sat', cpc: 1.5 },
  { day: 'Sun', cpc: 1.7 },
]

export function GoogleAdsDashboardContent({ clients, teamMembers, contentItems, campaigns, socialAccounts }: any) {
  const { t, dir } = useLanguage()
  const [activeTab, setActiveTab] = useState<'overview' | 'studio'>('overview')

  const totalSpend = campaigns?.reduce((acc: number, c: any) => acc + (c.spent || 0), 0) || 0
  const totalConversions = campaigns?.reduce((acc: number, c: any) => acc + (c.conversions || 0), 0) || 0
  const avgCtr = campaigns?.length > 0 ? (campaigns.reduce((acc: number, c: any) => acc + (c.impressions > 0 ? (c.clicks/c.impressions)*100 : 0), 0) / campaigns.length).toFixed(2) : '0.00'

  const platformStats = [
    { title: 'Total Spend', value: `${totalSpend.toLocaleString()} SAR`, trend: { value: 8.4, label: 'vs last week', positive: false }, icon: Wallet, color: 'blue' as const },
    { title: 'Conversions', value: totalConversions, trend: { value: 12.5, label: 'vs last week', positive: true }, icon: Target, color: 'emerald' as const },
    { title: 'Avg CTR', value: `${avgCtr}%`, trend: { value: 1.2, label: 'vs last week', positive: true }, icon: MousePointer2, color: 'purple' as const },
    { title: 'CPA', value: '42.5 SAR', trend: { value: 15.2, label: 'vs last week', positive: true }, icon: TrendingUp, color: 'pink' as const },
  ]

  return (
    <div className="space-y-6">
      {/* Platform Header */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 premium-card bg-gradient-to-r from-blue-600/10 via-emerald-600/10 to-blue-600/10 border-blue-100 dark:border-blue-900/30">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-2xl google-ads-bg flex items-center justify-center shadow-xl shadow-blue-500/20 rotate-3 group-hover:rotate-0 transition-transform">
            <Target className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Google Ads Studio</h1>
            <p className="text-[hsl(var(--muted-foreground))] mt-1">Performance management and intent-driven audience reach.</p>
          </div>
        </div>
        
        <div className="flex items-center bg-[hsl(var(--muted)/0.5)] p-1 rounded-xl border border-[hsl(var(--border))]">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-white dark:bg-black shadow-sm text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
          >
            <BarChart3 className="h-4 w-4" /> {t.overview}
          </button>
          <button 
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'studio' ? 'bg-white dark:bg-black shadow-sm text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
          >
            <Edit3 className="h-4 w-4" /> {t.createContent}
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-6 animate-slide-up">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {platformStats.map((s, idx) => (
              <AnalyticsCard key={idx} {...s} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* CPC Trend Chart */}
            <div className="lg:col-span-2">
              <ChartPanel title="CPC Benchmark Tracking" subtitle="Average cost-per-click evolution across campaigns">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={MOCK_CPC_HISTORY}>
                    <defs>
                      <linearGradient id="colorCpc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(val) => `${val} SAR`} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                    <Area type="monotone" dataKey="cpc" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorCpc)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>

            {/* Campaign Distribution */}
            <div>
              <ChartPanel title="Budget Allocation" subtitle="By campaign type">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Search', value: 55, color: '#3b82f6' },
                        { name: 'Display', value: 25, color: '#10b981' },
                        { name: 'P-Max', value: 20, color: '#6366f1' },
                      ]}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {[
                        { name: 'Search', value: 55, color: '#3b82f6' },
                        { name: 'Display', value: 25, color: '#10b981' },
                        { name: 'P-Max', value: 20, color: '#6366f1' },
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                   <p className="text-xs font-bold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                     <Settings className="h-3 w-3" /> AI Optimization
                   </p>
                   <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                     Search campaigns are delivering a 15% better ROAS. AI suggests shifting 10% of Display budget to performance-based Search keywords.
                   </p>
                </div>
              </ChartPanel>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 pb-12">
            {/* Active Campaigns List - Detailed View */}
            <div className="premium-card overflow-hidden">
               <div className="p-6 border-b border-[hsl(var(--border))] flex items-center justify-between">
                  <h3 className="font-bold text-lg">Active Performance Campaigns</h3>
                  <div className="flex items-center gap-2">
                     <button className="btn btn-ghost btn-xs border border-[hsl(var(--border))]"><Filter className="h-3 w-3" /> Filter</button>
                  </div>
               </div>
               <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm data-table">
                     <thead>
                        <tr>
                           <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>Campaign Info</th>
                           <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>Impressions</th>
                           <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>Clicks</th>
                           <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>CTR</th>
                           <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>Spent / Budget</th>
                           <th className={dir === 'rtl' ? 'text-right' : 'text-left'}>Status</th>
                        </tr>
                     </thead>
                     <tbody>
                        {campaigns?.map((c: any) => {
                           const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : '0.00'
                           const spendPct = c.budget > 0 ? (c.spent / c.budget) * 100 : 0
                           return (
                              <tr key={c.id} className="group cursor-pointer">
                                 <td>
                                    <div className="flex items-center gap-3">
                                       <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center"><Search className="h-4 w-4" /></div>
                                       <div>
                                          <p className="font-bold truncate max-w-[140px]">{c.name}</p>
                                          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{c.start_date}</p>
                                       </div>
                                    </div>
                                 </td>
                                 <td className="font-medium">{(c.impressions || 0).toLocaleString()}</td>
                                 <td className="font-medium">{(c.clicks || 0).toLocaleString()}</td>
                                 <td>
                                    <span className={`font-bold ${parseFloat(ctr) > 1 ? 'text-emerald-500' : 'text-amber-500'}`}>{ctr}%</span>
                                 </td>
                                 <td>
                                    <div className="space-y-1.5 w-[140px]">
                                       <div className="flex justify-between text-[10px]">
                                          <span>{c.spent?.toLocaleString()}</span>
                                          <span className="opacity-60">{c.budget?.toLocaleString()} SAR</span>
                                       </div>
                                       <div className="h-1.5 w-full bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                                          <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, spendPct)}%` }}></div>
                                       </div>
                                    </div>
                                 </td>
                                 <td>
                                    <span className={`badge text-[10px] ${c.status === 'active' ? 'badge-active' : 'badge-secondary'}`}>{c.status}</span>
                                 </td>
                              </tr>
                           )
                        })}
                     </tbody>
                  </table>
               </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-slide-up pb-12">
           <div className="p-8 premium-card border-dashed border-[hsl(var(--border))] text-center space-y-4">
              <div className="h-16 w-16 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600">
                 <Edit3 className="h-8 w-8" />
              </div>
              <div>
                 <h3 className="text-xl font-bold">Creative Ad Optimization</h3>
                 <p className="max-w-[400px] mx-auto text-[hsl(var(--muted-foreground))] text-sm mt-2">
                    Use our AI-driven creative studio to build responsive search ads, dynamic display banners, and performance-titles that convert.
                 </p>
              </div>
              <SocialContentCreator platform="google_ads" clients={clients} teamMembers={teamMembers} socialAccounts={socialAccounts} />
           </div>
        </div>
      )}
    </div>
  )
}
