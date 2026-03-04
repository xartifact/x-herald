'use client'

import { Card, CardContent } from '@/ui/card'
import { useFlowData, useModelRoutes } from './useModelRoutes'
import { FlowEditor } from './components/flow-editor'
import { RouteRulePanel } from './components/route-rule-panel'

export default function ModelRoutesPage() {
  const { data: flowData, isLoading: flowLoading } = useFlowData()
  const { data: routes = [], isLoading: routesLoading } = useModelRoutes()

  const isLoading = flowLoading || routesLoading

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">路由规则</h2>
        <p className="text-muted-foreground">
          使用可视化编辑器配置请求路由规则
        </p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">加载中...</div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-[1fr_320px] gap-4 h-[calc(100vh-220px)]">
          {/* 左侧 Flow 画布 */}
          <Card className="overflow-hidden">
            <CardContent className="p-0 h-full">
              <FlowEditor
                routes={flowData?.routes || []}
                virtualModels={flowData?.virtualModels || []}
              />
            </CardContent>
          </Card>

          {/* 右侧规则面板 */}
          <Card className="overflow-y-auto">
            <CardContent className="p-4">
              <RouteRulePanel routes={routes} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
