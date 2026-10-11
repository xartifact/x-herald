import { ListPlus, Pencil, Trash2, Layers } from 'lucide-react'

import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/card'
import { ROUTING_STRATEGIES } from './routing-config-fields'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../shared/components/ui/tabs'

import { ModelInstanceTable } from './model-instance-table'
import type { ModelGroup, ModelInstance } from '@xartifact/x-herald-shared'

interface ModelGroupCardProps {
  group: ModelGroup
  instances: ModelInstance[]
  onEdit: () => void
  onDelete: () => void
  /** 打开"从现有实例中选择"对话框 */
  onAddInstance: () => void
  onEditInstance: (instance: ModelInstance) => void
  onDeleteInstance: (instance: ModelInstance) => void
  onToggleInstance: (instance: ModelInstance) => void
  /** 拖拽结束后提交该组新的实例 id 顺序 */
  onReorderInstances: (orderedIds: string[]) => void
  onDetachInstance?: (instance: ModelInstance) => void
  getProviderName: (providerId: string) => string
}

export function ModelGroupCard({
  group,
  instances,
  onEdit,
  onDelete,
  onAddInstance,
  onEditInstance,
  onDeleteInstance,
  onToggleInstance,
  onReorderInstances,
  onDetachInstance,
  getProviderName,
}: ModelGroupCardProps) {
  return (
    <Card className="border-0 shadow-none rounded-none">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">{group.displayName || group.name}</CardTitle>
              <p className="text-sm text-muted-foreground break-all">{group.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {instances.length} 个实例
            </Badge>
            <span className={`resource-status ${group.enabled ? '' : 'off'}`}>
              {group.enabled ? '启用' : '禁用'}
            </span>
            <Button variant="ghost" size="sm" onClick={onEdit} aria-label="编辑模型组">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} aria-label="删除模型组">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-4">
          {group.description && (
            <p className="text-sm text-muted-foreground">{group.description}</p>
          )}
          <dl className="resource-summary">
            <div>
              <dt>路由策略</dt>
              <dd>
                {ROUTING_STRATEGIES.find(
                  (item) => item.value === (group.routingConfig?.strategy ?? 'priority'),
                )?.label ?? '优先级'}
              </dd>
            </div>
            <div>
              <dt>已启用实例</dt>
              <dd>
                {instances.filter((item) => item.enabled).length} / {instances.length}
              </dd>
            </div>
            <div>
              <dt>故障转移</dt>
              <dd>{(group.routingConfig?.fallbackEnabled ?? true) ? '已开启' : '已关闭'}</dd>
            </div>
          </dl>
          <Tabs defaultValue="instances">
            <TabsList>
              <TabsTrigger value="instances">模型实例</TabsTrigger>
              <TabsTrigger value="settings">组配置</TabsTrigger>
            </TabsList>
            <TabsContent value="settings" className="space-y-5 py-4">
              <p className="text-sm text-muted-foreground">
                {
                  ROUTING_STRATEGIES.find(
                    (item) => item.value === (group.routingConfig?.strategy ?? 'priority'),
                  )?.description
                }
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries({
                  流式输出: group.capabilities.streaming,
                  工具调用: group.capabilities.functionCalling,
                  视觉: group.capabilities.vision,
                  'JSON 模式': group.capabilities.jsonMode,
                }).map(([label, enabled]) => (
                  <Badge key={label} variant={enabled ? 'secondary' : 'outline'}>
                    {label} · {enabled ? '支持' : '未开启'}
                  </Badge>
                ))}
              </div>
              <p className="text-sm">
                上下文窗口 {group.capabilities.contextWindow.toLocaleString()} · 最大输出{' '}
                {group.capabilities.maxTokens.toLocaleString()}
              </p>
              <Button variant="outline" onClick={onEdit}>
                编辑组配置
              </Button>
            </TabsContent>
            <TabsContent value="instances" className="py-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">模型实例</h4>
                  <Button size="sm" variant="outline" onClick={onAddInstance}>
                    <ListPlus className="mr-2 h-3.5 w-3.5" />
                    从现有实例添加
                  </Button>
                </div>
                <div className="resource-table overflow-x-auto">
                  <ModelInstanceTable
                    instances={instances}
                    groupId={group.id}
                    getProviderName={getProviderName}
                    onEdit={onEditInstance}
                    onDelete={onDeleteInstance}
                    onToggle={onToggleInstance}
                    onReorder={onReorderInstances}
                    onDetach={
                      onDetachInstance
                        ? (_groupId, instance) => onDetachInstance(instance)
                        : undefined
                    }
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  )
}
