'use client'

import React, { useState } from 'react'
import {
  Ghost, Zap, Users, Eye, TrendingUp, Play, Star,
  BarChart3, Settings, ArrowUpRight, Camera
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { AnalyticsCard } from '@/components/dashboard/AnalyticsCard'
import { ChartPanel } from '@/components/dashboard/ChartPanel'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SocialContentCreator } from '@/components/social/SocialContentCreator'

const MOCK_STORY_DATA = [
  { name: 'Mon', views: 4200, completions: 3100 },
  { name: 'Tue', views: 5800, completions: 4200 },
  { name: 'Wed', views: 4900, completions: 3600 },
  { name: 'Thu', views: 6200, completions: 4800 },
  { name: 'Fri', views: 7100, completions: 5600 },
  { name: 'Sat', views: 8400, completions: 6900 },
  { name: 'Sun', views: 6800, completions: 5200 },
]

const SNAP_COLORS = ['#FFFC00', '#FFD700', '#FFC300', '#FFB300']

export function SnapchatDashboardContent({ clients, teamMembers, contentItems, socialAccounts }: any) {
  const { t, dir } = useLanguage()
  const [activeTab, setActiveTab] = useState<'overview' | 'studio'>('overview')

  const platformStats = [
    { title: 'Daily Story Views', value: '48.2k', trend: { value: 18.4, label: 'vs last week', positive: true }, icon: Eye, color: 'amber' as const },
    { title: 'Completion Rate', value: '72%', trend: { value: 4.1, label: 'vs last week', positive: true }, icon: Play, color: 'amber' as const },
    { title: 'Subscribers', value: '8.4k', trend: { value: 6.2, label: 'vs last week', positive: true }, icon: Users, color: 'purple' as const },
    { title: 'Avg Screenshots', value: '284', trend: { value: 11.3, label: 'vs last week', positive: true }, icon: Camera, color: 'blue' as const },
  ]

  return (
    <div className="space-y-6">
      {/* Platform Header */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 premium-card bg-gradient-to-r from-yellow-400/10 via-yellow-300/10 to-yellow-200/10 border-yellow-200 dark:border-yellow-900/30">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-[#FFFC00] flex items-center justify-center shadow-xl shadow-yellow-400/20 rotate-3">
            <Ghost className="h-8 w-8 text-black" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Snapchat Studio</h1>
            <p className="text-[hsl(var(--muted-foreground))] mt-1">Manage story performance, audience reach, and content strategy.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('overview')}
            className={`btn ${activeTab === 'overview' ? 'btn-primary shadow-lg' : 'btn-secondary'}`}
          >
            <BarChart3 className="h-4 w-4 mr-2" /> Overview
          </button>
          <button
            onClick={() => setActiveTab('studio')}
            className={`btn ${activeTab === 'studio' ? 'btn-primary shadow-lg' : 'btn-secondary'}`}
          >
            <Zap className="h-4 w-4 mr-2" /> Content Studio
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="animate-slide-up space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {platformStats.map((stat, i) => (
              <AnalyticsCard key={i} {...stat} />
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartPanel title="Story Views & Completions" subtitle="Daily 7-day performance">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={MOCK_STORY_DATA}>
                  <defs>
                    <linearGradient id="snapViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFFC00" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FFFC00" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="snapComp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="views" stroke="#FFFC00" fill="url(#snapViews)" name="Views" />
                  <Area type="monotone" dataKey="completions" stroke="#f59e0b" fill="url(#snapComp)" name="Completions" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title="Daily Story Views" subtitle="Views by day of week">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={MOCK_STORY_DATA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="views" radius={[4, 4, 0, 0]} name="Views">
                    {MOCK_STORY_DATA.map((_, i) => (
                      <Cell key={i} fill={SNAP_COLORS[i % SNAP_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
            {/* Recent Story Performance */}
            <div className="premium-card">
              <div className="p-6 pb-2">
                <h3 className="font-bold text-lg">Recent Story Performance</h3>
              </div>
              <div className="p-6 pt-2 space-y-4">
                {contentItems?.slice(0, 3).map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--border))]">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center overflow-hidden">
                        <Ghost className="h-4 w-4 text-black opacity-30" />
                      </div>
                      <div>
                        <p className="text-sm font-bold truncate max-w-[150px]">{c.title}</p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{c.publish_date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        {/* Deterministic display values based on title length + index — no Math.random() */}
                        <p className="text-xs font-bold">{(((c.title?.length || 4) * 283 + i * 719) % 2000 + 500).toLocaleString()}</p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Views</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-bold">{(((c.title?.length || 4) * 37 + i * 13) % 60 + 30)}%</p>
                        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Comp.</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Content Pipeline */}
            <div className="premium-card">
              <div className="p-6 pb-2">
                <h3 className="font-bold text-lg">Content Status Pipeline</h3>
              </div>
              <div className="p-6 pt-2 space-y-3">
                {['published', 'scheduled', 'approved', 'review', 'draft'].map((status) => {
                  const count = contentItems?.filter((c: any) => c.schedule_status === status).length || 0
                  return (
                    <div key={status} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold capitalize">
                        <span className="text-[hsl(var(--muted-foreground))]">{status}</span>
                        <span>{count} items</span>
                      </div>
                      <div className="h-2 w-full bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-1000 ${
                            status === 'published' ? 'bg-yellow-400' :
                            status === 'scheduled' ? 'bg-yellow-500' :
                            status === 'approved'  ? 'bg-emerald-500' :
                            status === 'review'    ? 'bg-indigo-500' : 'bg-gray-400'
                          }`}
                          style={{ width: `${Math.min(100, (count / (contentItems?.length || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                <div className="pt-4">
                  <button onClick={() => setActiveTab('studio')} className="w-full btn btn-secondary text-xs font-bold py-2">
                    Open Content Studio
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-slide-up pb-12">
          <SocialContentCreator
            platform="snapchat"
            clients={clients}
            teamMembers={teamMembers}
            socialAccounts={socialAccounts}
          />
        </div>
      )}
    </div>
  )
}
