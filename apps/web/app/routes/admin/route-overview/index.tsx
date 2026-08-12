import { Loader2 } from 'lucide-react'

import { RouteOverviewCanvas, Card, CardContent } from '@xartifact/x-herald-ui'

import { useRouteOverview } from '../../../hooks/use-route-overview'

export function RouteOverviewPage() {
  const { data = [], isLoading, isError } = useRouteOverview()

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-180px)]">
      <div>
        <h2 className="text-2xl font-bold">全局路由俯瞰图</h2>
        <p className="text-sm text-muted-foreground mt-1">
          一次总览所有接入模型的路由规则。每列代表一个接入模型，按颜色区分；同一列内的
          节点/连线属于该接入模型的路由。只读视图，点击缩放 / 拖动平移查看。
        </p>
      </div>

      <Card className="overflow-hidden flex-1 min-h-0">
        <CardContent className="p-0 h-full">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              加载中...
            </div>
          ) : isError ? (
            <div className="h-full flex items-center justify-center text-destructive">
              加载路由俯瞰图失败，请刷新重试
            </div>
          ) : data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              暂无接入模型，先去「对外接入」创建一个接入模型并配置路由规则
            </div>
          ) : (
            <RouteOverviewCanvas data={data} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
