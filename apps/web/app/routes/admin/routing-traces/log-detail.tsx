import { useParams, Link } from '@tanstack/react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'

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

  const { data, isLoading, error } = useRoutingTraceDetail(logId)

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
      ) : error || !data ? (
        <EmptyState title="未找到路由链路记录，或该请求未启用新链路追踪" />
      ) : (
        <RoutingTraceDetailView trace={data} />
      )}
    </div>
  )
}
