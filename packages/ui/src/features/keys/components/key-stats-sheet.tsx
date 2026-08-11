import { Button } from '../../../shared/components/ui/button'
import type { KeyStat } from '@xartifact/x-llm-gateway-shared'
import { Separator } from '../../../shared/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../../shared/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '../../../shared/components/ui/tabs'
import { StatCard } from '../../../shared/components/stat-card'

// TODO(6): from apps/web
import type { VirtualKey } from '@xartifact/x-llm-gateway-shared'
import { useKeyUsage, useResetKeyUsage } from '../hooks/use-keys'

interface KeyStatsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  virtualKey: VirtualKey | null
  stat: KeyStat | undefined
  period: 'today' | '7d' | '30d' | 'all'
  onPeriodChange: (period: 'today' | '7d' | '30d' | 'all') => void
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

interface RateLimitWindowStatus {
  current: number
  limit: number
  remaining: number
  resetAt: number
}

function ProgressBar({ current, limit }: { current: number; limit: number }) {
  const percentage = limit > 0 ? Math.min(100, (current / limit) * 100) : 0
  const barColor =
    percentage >= 90 ? 'bg-destructive' : percentage >= 70 ? 'bg-warning' : 'bg-primary'

  return (
    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${barColor}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

function RateLimitWindowRow({
  label,
  status,
  onReset,
  isResetting,
}: {
  label: string
  status: RateLimitWindowStatus | undefined
  onReset: () => void
  isResetting: boolean
}) {
  if (!status || status.limit <= 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={isResetting}>
          {isResetting ? '重置中...' : '重置'}
        </Button>
      </div>
      <ProgressBar current={status.current} limit={status.limit} />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {status.current.toLocaleString()} / {status.limit.toLocaleString()}
        </span>
        <span>剩余 {status.remaining.toLocaleString()}</span>
      </div>
    </div>
  )
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

  const keyId = virtualKey?.id ?? ''
  const { data: usage } = useKeyUsage(keyId)
  const resetUsage = useResetKeyUsage()

  const hasAnyLimit =
    virtualKey?.rateLimitRpm != null ||
    virtualKey?.rateLimitRpd != null ||
    virtualKey?.tokenLimitDaily != null

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
            title="总请求数"
            value={requestCount.toLocaleString()}
            sub={`成功 ${successCount} / 失败 ${stat?.failureCount ?? 0}`}
          />
          <StatCard
            title="成功率"
            value={`${successRate}%`}
            sub={requestCount === 0 ? '暂无数据' : undefined}
          />
          <StatCard
            title="Token 用量"
            value={formatTokens(totalTokens)}
            sub={`输入 ${formatTokens(stat?.totalInputTokens ?? 0)} / 输出 ${formatTokens(stat?.totalOutputTokens ?? 0)}`}
          />
          <StatCard
            title="平均响应时间"
            value={avgResponseTime > 0 ? `${avgResponseTime.toLocaleString()} ms` : '-'}
          />
        </div>

        <Separator className="my-4" />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">最近使用时间</span>
          <span className="font-medium">{lastUsedText}</span>
        </div>

        <Separator className="my-4" />

        <div className="space-y-4">
          <h4 className="text-sm font-medium">速率限制用量（实时）</h4>

          {hasAnyLimit ? (
            <div className="space-y-4">
              <RateLimitWindowRow
                label="每分钟请求数 (RPM)"
                status={usage?.rpm}
                onReset={() => resetUsage.mutate({ id: keyId, window: 'rpm' })}
                isResetting={resetUsage.isPending}
              />
              <RateLimitWindowRow
                label="每天请求数 (RPD)"
                status={usage?.rpd}
                onReset={() => resetUsage.mutate({ id: keyId, window: 'rpd' })}
                isResetting={resetUsage.isPending}
              />
              <RateLimitWindowRow
                label="每日 Token 限制"
                status={usage?.token}
                onReset={() => resetUsage.mutate({ id: keyId, window: 'token' })}
                isResetting={resetUsage.isPending}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">未配置速率限制</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
