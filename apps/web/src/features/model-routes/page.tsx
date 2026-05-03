'use client'

import { useModelGroups, useModelInstances } from '@/features/model-groups/useModelGroups'
import { useVirtualModels } from '@/features/virtual-models/useVirtualModels'
import { Card, CardContent } from '@/ui/card'

import { FlowEditor } from './components/flow-editor'
import { RouteRulePanel } from './components/route-rule-panel'
import { RuleDetailPanel } from './components/rule-detail-panel'
import { RuleFormDialog } from './components/rule-form-dialog'
import { useModelRoutePage } from './useModelRoutePage'
import { useModelRoutes } from './useModelRoutes'

export default function ModelRoutesPage() {
  // 分别获取所有数据
  const { data: routes = [], isLoading: routesLoading } = useModelRoutes()
  const { data: vms = [], isLoading: vmsLoading } = useVirtualModels()
  const { data: groups = [], isLoading: groupsLoading } = useModelGroups()
  const { data: instances = [], isLoading: instancesLoading } = useModelInstances()
  
  const {
    selectedRoute,
    selectedRouteId,
    formDialogOpen,
    editingRoute,
    handleCreate,
    handleEdit,
    handleDelete,
    handleToggle,
    handleCloseDetail,
    setFormDialogOpen,
    handleNodeClick,
    handleNodeDoubleClick,
    setSelectedRouteId,
  } = useModelRoutePage(routes)

  const isLoading = routesLoading || vmsLoading || groupsLoading || instancesLoading

  return (
    <div className="space-y-4 h-[calc(100vh-120px)]">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">路由规则</h2>
        <p className="text-muted-foreground text-sm">
          使用可视化编辑器配置请求路由规则
        </p>
      </div>

      {isLoading ? (
        <Card className="h-[calc(100%-60px)]">
          <CardContent className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
              <p>加载中...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-[280px_1fr_320px] gap-4 h-[calc(100%-60px)]">
          {/* 左侧：规则列表 */}
          <Card className="overflow-hidden">
            <RouteRulePanel
              routes={routes}
              vms={vms}
              groups={groups}
              instances={instances}
              selectedRouteId={selectedRouteId}
              onSelect={(route) => setSelectedRouteId(route.id)}
              onCreate={handleCreate}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          </Card>

          {/* 中间：Flow 画布（含节点模板侧栏） */}
          <Card className="overflow-hidden">
            <CardContent className="p-0 h-full">
              <FlowEditor
                routes={routes}
                vms={vms}
                groups={groups}
                instances={instances}
                selectedRouteId={selectedRouteId}
                onNodeClick={handleNodeClick}
                onNodeDoubleClick={handleNodeDoubleClick}
              />
            </CardContent>
          </Card>

          {/* 右侧：详情面板 */}
          <Card className="overflow-hidden">
            <RuleDetailPanel
              route={selectedRoute}
              vms={vms}
              groups={groups}
              instances={instances}
              onClose={handleCloseDetail}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          </Card>
        </div>
      )}

      {/* 表单对话框（创建/编辑共用） */}
      <RuleFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        editingRoute={editingRoute}
      />
    </div>
  )
}
