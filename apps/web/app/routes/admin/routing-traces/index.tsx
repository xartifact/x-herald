import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react'

import {
  RoutingTraceTable,
  useRoutingTraces,
  PageHeader,
  EmptyState,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  Label,
} from '@xartifact/x-herald-ui'

const PAGE_SIZE = 20

export function RoutingTracesPage() {
  const navigate = useNavigate()
  const [modelName, setModelName] = useState('')
  const [outcome, setOutcome] = useState<'all' | 'success' | 'rejected' | 'all_failed'>('all')
  const [hasFailover, setHasFailover] = useState(false)
  // cursorStack 模式与 /admin/logs 一致：page 1 = []，page N = [...priorCursors, currentCursor]
  const [cursorStack, setCursorStack] = useState<string[]>([])

  const currentCursor = cursorStack.length > 0 ? cursorStack[cursorStack.length - 1] : undefined
  const currentPage = cursorStack.length + 1

  // 筛选条件变化时回到第一页
  useEffect(() => {
    setCursorStack([])
  }, [modelName, outcome, hasFailover])

  const filters = useMemo(
    () => ({
      modelName: modelName || undefined,
      outcome: outcome === 'all' ? undefined : outcome,
      hasFailover: hasFailover || undefined,
      pageSize: PAGE_SIZE,
      cursor: currentCursor,
    }),
    [modelName, outcome, hasFailover, currentCursor],
  )

  const { data, isLoading, refetch, isFetching } = useRoutingTraces(filters)
  const items = data?.items ?? []
  const nextCursor = data?.nextCursor ?? null
  const hasMore = data?.hasMore ?? false

  const handleNextPage = useCallback(() => {
    if (nextCursor) setCursorStack((prev) => [...prev, nextCursor])
  }, [nextCursor])
  const handlePrevPage = useCallback(() => {
    setCursorStack((prev) => prev.slice(0, -1))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="路由链路追踪"
        description="每次请求的完整路由链路 — 包含主备降级链、候选实例、实际 outcome"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        }
      />

      {/* 过滤器 */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">客户端模型</Label>
          <Input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="如 gpt-4 / claude-3..."
            className="h-8 w-48 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">结果</Label>
          <Select value={outcome} onValueChange={(v) => setOutcome(v as typeof outcome)}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="rejected">拒绝</SelectItem>
              <SelectItem value="all_failed">全部失败</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="has-failover"
            checked={hasFailover}
            onCheckedChange={(checked) => setHasFailover(checked === true)}
          />
          <Label htmlFor="has-failover" className="text-xs cursor-pointer">
            仅显示跨 provider 降级
          </Label>
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <h3 className="text-sm font-medium tracking-wide uppercase text-muted-foreground">
            路由链路记录
          </h3>
          <span className="text-xs text-muted-foreground">第 {currentPage} 页</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="没有匹配的路由链路记录" />
      ) : (
        <RoutingTraceTable
          traces={items}
          onViewDetail={(logId) =>
            navigate({ to: '/admin/routing-traces/$logId', params: { logId } })
          }
        />
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-muted-foreground">
            {isFetching ? '同步中…' : `共 ${PAGE_SIZE} 条/页`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={cursorStack.length === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>
            <Button variant="outline" size="sm" onClick={handleNextPage} disabled={!hasMore}>
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
