'use client'

import type { KeyStat } from '../../hooks/use-logs'
import { Card, CardContent } from '../ui/card'
import { Separator } from '../ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'

// TODO(6): from apps/web
import type { VirtualKey } from '@x-llm-gateway/shared'

interface KeyStatsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  virtualKey: VirtualKey | null
  stat: KeyStat | undefined
  period: 'today' | '7d' | '30d' | 'all'
  onPeriodChange: (period: 'today' | '7d' | '30d' | 'all') => void
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

const PERIOD_LABELS: Record<string, string> = {
  today: '今日',
  '7d': '近 7 天',
  '30d': '近 30 天',
  all: '全部',
}

export function KeyStatsSheet({
  open,
  onOpenChange,
  virtualKey,
  stat,
  period,
  onPeriodChange,
}: KeyStatsSheetProps) {
  const requestCount = stat?.requestCount ?? 0
  const successCount = stat?.successCount ?? 0
  const successRate = requestCount > 0 ? Math.round((successCount / requestCount) * 100) : 0
  const totalTokens = stat?.totalTokens ?? 0
  const avgResponseTime = stat?.avgResponseTimeMs ?? 0

  const lastUsedText = stat?.lastUsedAt
    ? new Date(stat.lastUsedAt).toLocaleString('zh-CN')
    : '从未使用'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{virtualKey?.name ?? '-'} 用量统计</SheetTitle>
        </SheetHeader>

        <Tabs value={period} onValueChange={(v) => onPeriodChange(v as typeof period)}>
          <TabsList className="mb-4 w-full">
            {(['today', '7d', '30d', 'all'] as const).map((p) => (
              <TabsTrigger key={p} value={p} className="flex-1">
                {PERIOD_LABELS[p]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="总请求数"
            value={requestCount.toLocaleString()}
            sub={`成功 ${successCount} / 失败 ${stat?.failureCount ?? 0}`}
          />
          <StatCard
            label="成功率"
            value={`${successRate}%`}
            sub={requestCount === 0 ? '暂无数据' : undefined}
          />
          <StatCard
            label="Token 用量"
            value={formatTokens(totalTokens)}
            sub={`输入 ${formatTokens(stat?.totalInputTokens ?? 0)} / 输出 ${formatTokens(stat?.totalOutputTokens ?? 0)}`}
          />
          <StatCard
            label="平均响应时间"
            value={avgResponseTime > 0 ? `${avgResponseTime.toLocaleString()} ms` : '-'}
          />
        </div>

        <Separator className="my-4" />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">最近使用时间</span>
          <span className="font-medium">{lastUsedText}</span>
        </div>
      </SheetContent>
    </Sheet>
  )
}
