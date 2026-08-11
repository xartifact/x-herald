import { Card, CardContent, CardHeader, CardTitle, Skeleton } from './ui'
import { cn } from '../lib/utils'

type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info'

interface StatCardProps {
  title: string
  value: React.ReactNode
  icon?: React.ReactNode
  sub?: React.ReactNode
  loading?: boolean
  tone?: StatTone
  className?: string
}

const TONE_TEXT: Record<StatTone, string> = {
  default: '',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  info: 'text-info',
}

/**
 * 统一的统计卡片。替代 LogStatsCards / CostSummaryCards / MetricsSummaryCards 等多套并行实现。
 *
 * - `loading` 时数值位渲染 Skeleton
 * - `tone` 对数值做语义着色（成功/警告/危险/信息），默认不上色
 * - 图标统一 `text-muted-foreground`
 */
export function StatCard({
  title,
  value,
  icon,
  sub,
  loading = false,
  tone = 'default',
  className,
}: StatCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', TONE_TEXT[tone])}>
          {loading ? <Skeleton className="h-8 w-16" /> : value}
        </div>
        {sub ? <div className="text-xs text-muted-foreground mt-1">{sub}</div> : null}
      </CardContent>
    </Card>
  )
}

export type { StatCardProps, StatTone }
