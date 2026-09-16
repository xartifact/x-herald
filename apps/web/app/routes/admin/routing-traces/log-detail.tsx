import { useParams, Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react'

import {
  RoutingTraceDetailView,
  useRoutingTraceDetail,
  PageHeader,
  EmptyState,
  Button,
} from '@xartifact/x-herald-ui'

export function RoutingTraceDetailPage() {
  const params = useParams({ strict: false }) as { logId?: string }
  const logId = params.logId ?? null

  const { data, isLoading, error, isFetching, refetch } = useRoutingTraceDetail(logId)

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/routing-traces">
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回列表
          </Link>
        </Button>
      </div>

      <PageHeader
        title="路由链路详情"
        description={
          <>
            request_log: <span className="font-mono">{logId}</span>
          </>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      ) : error ? (
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
          title="链路追踪加载失败"
          description={
            error instanceof Error ? error.message : '服务暂时无法返回这条请求的链路信息'
          }
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              重试
            </Button>
          }
        />
      ) : !data ? (
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5 text-warning" />}
          title="未找到请求记录"
          description="这条 request_log 可能已经被清理，或链接中的 ID 不正确。"
        />
      ) : (
        <RoutingTraceDetailView trace={data} />
      )}
    </div>
  )
}
