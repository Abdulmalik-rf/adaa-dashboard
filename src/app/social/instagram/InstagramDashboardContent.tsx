'use client'

import React, { useState } from 'react'
import { 
  Camera, TrendingUp, Users, Eye, MessageCircle, Heart, 
  BarChart3, Layout, Edit3, Settings, MoreHorizontal, ArrowUpRight 
} from 'lucide-react'
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts'
import { AnalyticsCard } from '@/components/dashboard/AnalyticsCard'
import { ChartPanel } from '@/components/dashboard/ChartPanel'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SocialContentCreator } from '@/components/social/SocialContentCreator'

const MOCK_GROWTH_DATA = [
  { name: 'Week 1', followers: 12400, reach: 45000 },
  { name: 'Week 2', followers: 12800, reach: 52000 },
  { name: 'Week 3', followers: 13200, reach: 48000 },
  { name: 'Week 4', followers: 14100, reach: 68000 },
]

const MOCK_CONTENT_MIX = [
  { name: 'Reels', value: 45, color: '#f09433' },
  { name: 'Carousel', value: 30, color: '#e6683c' },
  { name: 'Posts', value: 25, color: '#dc2743' },
]

export function InstagramDashboardContent({ clients, teamMembers, contentItems, socialAccounts }: any) {
  const { t, dir } = useLanguage()
  const [activeTab, setActiveTab] = useState<'overview' | 'studio'>('overview')

  const platformStats = [
    { title: 'Total Reach', value: '184.2k', trend: { value: 24.3, label: 'vs last week', positive: true }, icon: Eye, color: 'blue' as const },
    { title: 'Engagement', value: '4.8%', trend: { value: 0.5, label: 'vs last week', positive: true }, icon: Heart, color: 'pink' as const },
    { title: 'Followers', value: '14.1k', trend: { value: 8.2, label: 'vs last week', positive: true }, icon: Users, color: 'purple' as const },
    { title: 'Avg Likes', value: '1.2k', trend: { value: 12.5, label: 'vs last week', positive: true }, icon: MessageCircle, color: 'amber' as const },
  ]

  const statusColor: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    review: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
    approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    published: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  }

  return (
    <div className="space-y-6">
      {/* Platform Header Section */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 premium-card bg-gradient-to-r from-pink-500/10 via-red-500/10 to-amber-500/10 border-pink-100 dark:border-pink-900/30">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-2xl instagram-gradient flex items-center justify-center shadow-xl shadow-pink-500/20 rotate-3 group-hover:rotate-0 transition-transform">
            <Camera className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Instagram Studio</h1>
            <p className="text-[hsl(var(--muted-foreground))] mt-1">Manage performance, audience growth, and content strategy.</p>
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

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Reach Growth */}
            <div className="lg:col-span-2">
              <ChartPanel title="Audience Reach & Growth" subtitle="Tracking account visibility over time">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={MOCK_GROWTH_DATA}>
                    <defs>
                      <linearGradient id="colorReach" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(val) => `${val/1000}k`} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} />
                    <Area type="monotone" dataKey="reach" stroke="#ec4899" strokeWidth={3} fillOpacity={1} fill="url(#colorReach)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartPanel>
            </div>

            {/* Content Mix */}
            <div>
              <ChartPanel title="Content Performance Mix" subtitle="Engagement by type">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={MOCK_CONTENT_MIX} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {MOCK_CONTENT_MIX.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                   <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[10px] text-emerald-800 dark:text-emerald-400 font-medium leading-relaxed">
                     💡 <strong>Recommendation:</strong> Your Reels are getting 2.4x more reach than standard posts. AI suggests increasing Reel frequency to 4x per week.
                   </div>
                </div>
              </ChartPanel>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
            {/* Top Posts */}
            <div className="premium-card">
              <div className="p-6 pb-2">
                <h3 className="font-bold text-lg">Top Performing Content</h3>
              </div>
              <div className="p-6 pt-2 space-y-2">
                {contentItems?.slice(0, 4).map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[hsl(var(--muted)/0.3)] transition-all group cursor-pointer border border-transparent hover:border-[hsl(var(--border))]">
                    <div className="h-12 w-12 rounded-lg instagram-gradient flex items-center justify-center text-white font-bold">{item.content_type?.slice(0,1).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{item.title}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">Reach: {(((item.title?.length || 5) * 317 + i * 891) % 4000 + 1000).toLocaleString()} • Likes: {(((item.title?.length || 5) * 43 + i * 127) % 350 + 50).toLocaleString()}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            </div>

            {/* Pipeline / Queue */}
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
                             status === 'published' ? 'bg-purple-500' :
                             status === 'scheduled' ? 'bg-blue-500' :
                             status === 'approved' ? 'bg-emerald-500' :
                             status === 'review' ? 'bg-indigo-500' : 'bg-gray-400'
                           }`} 
                           style={{ width: `${Math.min(100, (count / (contentItems?.length || 1)) * 100)}%` }}
                         ></div>
                       </div>
                     </div>
                   )
                 })}
                 <div className="pt-4">
                    <button onClick={() => setActiveTab('studio')} className="w-full btn btn-secondary text-xs font-bold py-2">
                       Full Scheduler Detail
                    </button>
                 </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-slide-up pb-12">
          <SocialContentCreator 
            platform="instagram" 
            clients={clients} 
            teamMembers={teamMembers} 
            socialAccounts={socialAccounts}
          />
        </div>
      )}
    </div>
  )
}
