'use client'

import React from 'react'
import { ArrowUpRight, ArrowDownRight, LucideIcon } from 'lucide-react'

interface AnalyticsCardProps {
  title: string
  value: string | number
  trend?: {
    value: number
    label: string
    positive: boolean
  }
  icon: LucideIcon
  color: 'blue' | 'emerald' | 'amber' | 'pink' | 'purple' | 'indigo' | 'slate'
  description?: string
}

export function AnalyticsCard({ title, value, trend, icon: Icon, color, description }: AnalyticsCardProps) {
  const colorMap = {
    blue: 'bg-blue-500/10 text-blue-600 border-blue-200/50 dark:border-blue-800/30',
    emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50 dark:border-emerald-800/30',
    amber: 'bg-amber-500/10 text-amber-600 border-amber-200/50 dark:border-amber-800/30',
    pink: 'bg-pink-500/10 text-pink-600 border-pink-200/50 dark:border-pink-800/30',
    purple: 'bg-purple-500/10 text-purple-600 border-purple-200/50 dark:border-purple-800/30',
    indigo: 'bg-indigo-500/10 text-indigo-600 border-indigo-200/50 dark:border-indigo-800/30',
    slate: 'bg-slate-500/10 text-slate-600 border-slate-200/50 dark:border-slate-800/30',
  }

  return (
    <div className="premium-card p-6 group">
      <div className="flex items-start justify-between">
        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border ${colorMap[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 font-bold text-xs px-2 py-1 rounded-full ${trend.positive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
            {trend.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {trend.value}%
          </div>
        )}
      </div>
      
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{title}</h3>
        <div className="text-3xl font-bold tracking-tight mt-1">{value}</div>
        {description && <p className="text-xs text-[hsl(var(--muted-foreground)/0.8)] mt-1">{description}</p>}
      </div>
    </div>
  )
}
