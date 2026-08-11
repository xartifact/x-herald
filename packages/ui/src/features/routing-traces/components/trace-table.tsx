import { useNavigate } from '@tanstack/react-router'
import { Activity, ArrowRight, ShieldCheck } from 'lucide-react'

import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'

import type { RoutingTraceSummary } from '@xartifact/x-llm-gateway-shared'

interface RoutingTraceTableProps {
  traces: RoutingTraceSummary[]
  onViewDetail?: (logId: string) => void
}

const OUTCOME_CONFIG = {
  success: { label: '成功', variant: 'default' as const, color: 'text-success' },
  rejected: { label: '拒绝', variant: 'destructive' as const, color: 'text-destructive' },
  all_failed: { label: '全部失败', variant: 'secondary' as const, color: 'text-warning' },
} as const

const CHAIN_KIND_CONFIG = {
  primary: { label: '主', icon: Activity, color: 'text-info' },
  backup: { label: '备', icon: ShieldCheck, color: 'text-primary' },
  single: { label: '单', icon: ArrowRight, color: 'text-muted-foreground' },
} as const

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function RoutingTraceTable({ traces, onViewDetail }: RoutingTraceTableProps) {
  const navigate = useNavigate()

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>请求时间</TableHead>
            <TableHead>客户端模型</TableHead>
            <TableHead>命中规则</TableHead>
            <TableHead>结果</TableHead>
            <TableHead>最终出口</TableHead>
            <TableHead className="text-right">候选数</TableHead>
            <TableHead className="text-right">耗时</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {traces.map((t) => {
            const outcome = OUTCOME_CONFIG[t.outcome] ?? OUTCOME_CONFIG.all_failed
            const kind = t.finalChainKind ? CHAIN_KIND_CONFIG[t.finalChainKind] : null
            const KindIcon = kind?.icon
            return (
              <TableRow key={t.logId} className="cursor-pointer hover:bg-muted/40">
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(t.createdAt).toLocaleString('zh-CN', { hour12: false })}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{t.requestedModel}</div>
                  {t.accessModelName && t.accessModelName !== t.requestedModel && (
                    <div className="text-xs text-muted-foreground">→ {t.accessModelName}</div>
                  )}
                </TableCell>
                <TableCell>
                  {t.matchedRuleName ? (
                    <Badge variant="outline" className="text-xs">
                      {t.matchedRuleName}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={outcome.variant} className="text-xs">
                    {outcome.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {t.finalProviderName ? (
                    <div className="flex items-center gap-1.5">
                      {KindIcon && <KindIcon className={`h-3 w-3 ${kind.color}`} />}
                      <span className="text-sm">{t.finalProviderName}</span>
                      {t.finalInstanceName && (
                        <span className="text-xs text-muted-foreground">
                          / {t.finalInstanceName}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm">{t.totalAttempts}</TableCell>
                <TableCell className="text-right text-sm">
                  {formatDuration(t.totalDurationMs)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (onViewDetail) onViewDetail(t.logId)
                      else
                        navigate({
                          to: '/admin/routing-traces/$logId',
                          params: { logId: t.logId },
                        })
                    }}
                  >
                    详情
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
