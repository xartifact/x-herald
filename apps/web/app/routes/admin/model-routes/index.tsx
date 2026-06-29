import { useMemo } from 'react'

import { useModelRoutes, useModelRoutePage } from '../../../hooks/model-routes'
import { useAccessModels } from '../../../hooks/access-models'
import { useModelGroups, useModelInstances } from '../../../hooks/model-groups'
import { buildFlowFromData } from '@xartifact/x-llm-gateway-ui'
import {
  Card, CardContent,
  FlowEditor, DeployBanner,
} from '@xartifact/x-llm-gateway-ui'

export function ModelRoutesPage() {
  const { data: routes = [], isLoading: routesLoading } = useModelRoutes()
  const { data: vms = [], isLoading: vmsLoading } = useAccessModels()
  const { data: groups = [], isLoading: groupsLoading } = useModelGroups()
  const { data: instances = [], isLoading: instancesLoading } = useModelInstances()

  const {
    flowEditorRef,
    selectedNode,
    isDirty,
    isDeploying,
    handleNodesEdgesChange,
    handleNodeSelect,
    handleUpdateNodeData,
    handleDeploy,
  } = useModelRoutePage()

  const isLoading = routesLoading || vmsLoading || groupsLoading || instancesLoading

  // 从 DB 数据构建初始 Flow 节点/边（每次数据刷新后重建）
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowFromData(routes, vms, groups, instances),
    [routes, vms, groups, instances],
  )

  const refreshKey = `${routes.length}-${vms.length}-${groups.length}-${instances.length}`

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-4">
      {/* 页面标题 + 部署状态 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">路由规则</h2>
          <p className="text-muted-foreground text-sm">
            在画布中可视化编辑路由流程，完成后点击部署生效
          </p>
        </div>
        <DeployBanner isDirty={isDirty} isDeploying={isDeploying} onDeploy={handleDeploy} />
      </div>

      {/* 主体区域：画布（属性面板已内置） */}
      {isLoading ? (
        <Card className="flex-1">
          <CardContent className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2" />
              <p>加载中...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex-1 min-h-0">
          <Card className="overflow-hidden h-full">
            <CardContent className="p-0 h-full">
              <FlowEditor
                ref={flowEditorRef}
                initialNodes={initialNodes}
                initialEdges={initialEdges}
                refreshKey={refreshKey}
                onNodesEdgesChange={handleNodesEdgesChange}
                onNodeSelect={handleNodeSelect}
                selectedNode={selectedNode}
                onUpdateNodeData={handleUpdateNodeData}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
