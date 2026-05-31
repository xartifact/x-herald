'use client'

import { useState } from 'react'

import { cn } from '../../../lib/utils'

interface BodySubTabItem {
  key: string
  label: string
  data: Record<string, unknown> | null
  emptyText: string
}

interface BodySubTabsProps {
  tabs: BodySubTabItem[]
}

export function BodySubTabs({ tabs }: BodySubTabsProps) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key || '')
  const activeTab = tabs.find((t) => t.key === activeKey)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 pt-2 pb-1.5 flex-shrink-0">
        <div className="flex gap-1 bg-muted p-1 rounded-md">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveKey(tab.key)}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors',
                activeKey === tab.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 p-4 pt-2 overflow-auto">
        {activeTab?.data ? (
          <pre className="text-xs font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(activeTab.data, null, 2)}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            {activeTab?.emptyText || '无数据'}
          </div>
        )}
      </div>
    </div>
  )
}
