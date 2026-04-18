"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

export function ClientWorkspaceTabs({ tabs }: { tabs: { name: string, content: React.ReactNode }[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0].name)

  return (
    <div className="flex flex-col h-full space-y-6">
        <nav className="tab-list w-full border-b border-[hsl(var(--border))] rounded-none px-4 pt-4 pb-0 bg-[hsl(var(--muted)/0.2)]" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className={`tab-item pb-4 rounded-b-none border-b-2 bg-transparent ${
                activeTab === tab.name
                  ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))] shadow-none"
                  : "border-transparent hover:border-[hsl(var(--primary)/0.3)] hover:bg-transparent text-[hsl(var(--muted-foreground))]"
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      <div className="flex-1">
        {tabs.find(t => t.name === activeTab)?.content}
      </div>
    </div>
  )
}
