'use client'

import React, { ReactNode } from 'react'

interface ChartPanelProps {
  title: string
  subtitle?: string
  children: ReactNode
  action?: ReactNode
}

export function ChartPanel({ title, subtitle, children, action }: ChartPanelProps) {
  return (
    <div className="premium-card h-full flex flex-col">
      <div className="p-6 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-lg">{title}</h3>
          {subtitle && <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="flex-1 p-6 pt-0 min-h-[300px]">
        {children}
      </div>
    </div>
  )
}
