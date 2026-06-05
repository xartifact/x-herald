'use client'

import { useState } from 'react'

import { ArrowLeftRight, Columns2, Filter, Rows2 } from 'lucide-react'

import { Button } from '../../../../shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../../shared/components/ui/dialog'
import { Separator } from '../../../../shared/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../shared/components/ui/tabs'
import { JsonDiffViewer, JsonViewer } from '../../../../shared'

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
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffLeft, setDiffLeft] = useState(tabs[0]?.key || '')
  const [diffRight, setDiffRight] = useState(tabs[1]?.key || '')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [inline, setInline] = useState(false)

  const leftTab = tabs.find((t) => t.key === diffLeft)
  const rightTab = tabs.find((t) => t.key === diffRight)

  return (
    <>
      <Tabs defaultValue={tabs[0]?.key} className="flex flex-col flex-1 min-h-0">
        <div className="px-4 pt-2 pb-1.5 flex-shrink-0 flex items-center gap-2">
          <TabsList className="grid flex-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDiffOpen(true)}
            className="h-8 px-2 text-xs flex-shrink-0"
            title="Diff 比对"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        {tabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className="flex-1 m-0 p-4 pt-2 flex flex-col min-h-0">
            {tab.data ? (
              <JsonViewer data={tab.data} height="auto" />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                {tab.emptyText}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-[90vw] w-[90vw] h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base">Diff 比对</DialogTitle>
              <div className="flex items-center gap-2">
                <select
                  value={diffLeft}
                  onChange={(e) => setDiffLeft(e.target.value)}
                  className="h-8 rounded-md border bg-background px-3 text-sm"
                >
                  {tabs.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <select
                  value={diffRight}
                  onChange={(e) => setDiffRight(e.target.value)}
                  className="h-8 rounded-md border bg-background px-3 text-sm"
                >
                  {tabs.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <Separator orientation="vertical" className="h-6 mx-1" />
                <Button
                  variant={onlyDiff ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setOnlyDiff(!onlyDiff)}
                  className="h-8 px-2.5 text-xs gap-1.5"
                  title="只显示差异"
                >
                  <Filter className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">只显示差异</span>
                </Button>
                <Button
                  variant={inline ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setInline(!inline)}
                  className="h-8 px-2.5 text-xs gap-1.5"
                  title={inline ? '切换为并排模式' : '切换为内联模式'}
                >
                  {inline ? <Rows2 className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{inline ? '内联' : '并排'}</span>
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 p-4 flex flex-col">
            {leftTab?.data && rightTab?.data ? (
              <JsonDiffViewer
                original={leftTab.data}
                modified={rightTab.data}
                originalLabel={leftTab.label}
                modifiedLabel={rightTab.label}
                height="auto"
                onlyDiff={onlyDiff}
                inline={inline}
              />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                选中的数据源为空，无法比对
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
