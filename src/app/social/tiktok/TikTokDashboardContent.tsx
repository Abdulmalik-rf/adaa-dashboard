'use client'

import React, { useState } from 'react'
import { 
  Zap, TrendingUp, Users, Play, MessageSquare, Heart, 
  BarChart3, Layout, Edit3, Settings, MoreHorizontal, ArrowUpRight,
  ShieldCheck, Share2
} from 'lucide-react'
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts'
import { AnalyticsCard } from '@/components/dashboard/AnalyticsCard'
import { ChartPanel } from '@/components/dashboard/ChartPanel'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SocialContentCreator } from '@/components/social/SocialContentCreator'

const MOCK_RETENTION_DATA = [
  { time: '0s', retention: 100 },
  { time: '2s', retention: 85 },
  { time: '5s', retention: 65 },
  { time: '10s', retention: 45 },
  { time: '15s', retention: 32 },
  { time: '20s', retention: 25 },
]

const MOCK_VIEW_GROWTH = [
  { name: 'Mon', views: 5000 },
  { name: 'Tue', views: 12000 },
  { name: 'Wed', views: 8000 },
  { name: 'Thu', views: 25000 },
  { name: 'Fri', views: 18000 },
  { name: 'Sat', views: 42000 },
  { name: 'Sun', views: 35000 },
]

export function TikTokDashboardContent({ clients, teamMembers, contentItems, socialAccounts }: any) {
  const { t, dir } = useLanguage()
  const [activeTab, setActiveTab] = useState<'overview' | 'studio'>('overview')

  const platformStats = [
    { title: 'Video Views', value: '452.8k', trend: { value: 38.2, label: 'vs last week', positive: true }, icon: Play, color: 'slate' as const },
    { title: 'Avg Watch Time', value: '8.4s', trend: { value: 1.2, label: 'vs last week', positive: true }, icon: ShieldCheck, color: 'blue' as const },
    { title: 'New Followers', value: '+4.2k', trend: { value: 54.1, label: 'vs last week', positive: true }, icon: Users, color: 'purple' as const },
    { title: 'Shares', value: '1.8k', trend: { value: 15.3, label: 'vs last week', positive: true }, icon: Share2, color: 'pink' as const },
  ]

  return (
    <div className="space-y-6">
      {/* Platform Header */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 premium-card bg-black border-slate-800">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center shadow-xl shadow-white/5 rotate-3 group-hover:rotate-0 transition-transform">
            <Zap className="h-8 w-8 text-black" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">TikTok Studio</h1>
            <p className="text-slate-400 mt-1">Virality tracking and short-form video optimization.</p>
          </div>
        </div>
        
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-white text-black shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            <BarChart3 className="h-4 w-4" /> {t.overview}
          </button>
          <button 
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'studio' ? 'bg-white text-black shadow-sm' : 'text-slate-400 hover:text-white'}`}
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
            {/* View Growth Chart */}
            <div className="lg:col-span-2">
              <ChartPanel title="Viral Pulse Tracking" subtitle="Daily view counts across all distributed content">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={MOCK_VIEW_GROWTH}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(val) => `${val/1000}k`} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.3)' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} />
                    <Bar dataKey="views" radius={[6, 6, 0, 0]}>
                       {MOCK_VIEW_GROWTH.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={index === 5 ? '#ec4899' : 'hsl(var(--primary))'} />
                       ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>

            {/* Retention Chart */}
            <div>
              <ChartPanel title="Retention Benchmark" subtitle="Avg user drop-off across videos">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={MOCK_RETENTION_DATA}>
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip />
                    <Area type="monotone" dataKey="retention" stroke="#a855f7" strokeWidth={3} fill="#a855f7" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="mt-4 p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
                  <p className="text-xs font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2">
                    <Zap className="h-3 w-3" /> Viral Alert
                  </p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                    Your retention at 2s is 85%. This is higher than your category average. Focus on sustaining mid-video interest between 5-10s.
                  </p>
                </div>
              </ChartPanel>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
            {/* Best Posting Times */}
            <div className="premium-card">
              <div className="p-6">
                <h3 className="font-bold text-lg mb-4">Optimal Posting Windows</h3>
                <div className="space-y-4">
                  {[
                    { day: 'Today', time: '8:45 PM', confidence: 94, reason: 'High activity bubble' },
                    { day: 'Tomorrow', time: '7:15 PM', confidence: 88, reason: 'Trend alignment' },
                    { day: 'Saturday', time: '11:00 AM', confidence: 82, reason: 'Weekend lifestyle peak' },
                  ].map((t, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[hsl(var(--muted)/0.3)]">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center text-white font-bold text-xs">{t.day[0]}</div>
                        <div>
                          <p className="text-sm font-bold">{t.time}</p>
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{t.reason}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-emerald-500">{t.confidence}%</p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-bold">Match</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Trending Hooks */}
            <div className="premium-card">
              <div className="p-6">
                <h3 className="font-bold text-lg mb-4">Viral Hook Library</h3>
                <div className="space-y-3">
                   {[
                     'The reason you are not seeing [Result] is simple...',
                     'I tried every [Method] so you dont have to.',
                     'POV: You just discovered the best [Category] hack...',
                     'Stop scrolling if you want to [Outcome]...',
                   ].map((hook, i) => (
                     <div key={i} className="group relative p-3 rounded-xl border border-[hsl(var(--border))] hover:border-purple-500/50 hover:bg-purple-500/5 transition-all cursor-pointer">
                        <p className="text-xs font-medium italic">"{hook}"</p>
                        <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                           <Edit3 className="h-3 w-3 text-purple-500" />
                        </div>
                     </div>
                   ))}
                   <button className="w-full btn btn-ghost text-xs mt-2 border-dashed border-[hsl(var(--border))]">
                      Generate More AI Hooks
                   </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-slide-up pb-12">
           <SocialContentCreator platform="tiktok" clients={clients} teamMembers={teamMembers} socialAccounts={socialAccounts} />
        </div>
      )}
    </div>
  )
}
