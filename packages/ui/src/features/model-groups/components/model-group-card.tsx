import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Layers } from 'lucide-react'

import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/card'
import { Separator } from '../../../shared/components/ui/separator'

import { ModelInstanceTable } from './model-instance-table'
import type { ModelGroup, ModelInstance } from '@xartifact/x-herald-shared'

interface ModelGroupCardProps {
  group: ModelGroup
  instances: ModelInstance[]
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onDelete: () => void
  onAddInstance: () => void
  onEditInstance: (instance: ModelInstance) => void
  onDeleteInstance: (instance: ModelInstance) => void
  onToggleInstance: (instance: ModelInstance) => void
  onMoveInstance: (instanceId: string, direction: 'up' | 'down') => void
  getProviderName: (providerId: string) => string
}

export function ModelGroupCard({
  group,
  instances,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddInstance,
  onEditInstance,
  onDeleteInstance,
  onToggleInstance,
  onMoveInstance,
  getProviderName,
}: ModelGroupCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">{group.displayName || group.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{group.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {instances.length} 个实例
            </Badge>
            <Badge variant={group.enabled ? 'default' : 'destructive'}>
              {group.enabled ? '启用' : '禁用'}
            </Badge>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggleExpand}>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-4">
            {group.description && (
              <p className="text-sm text-muted-foreground">{group.description}</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">流式:</span>
                <span className="ml-2">{group.capabilities.streaming ? '✓' : '✗'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">函数调用:</span>
                <span className="ml-2">{group.capabilities.functionCalling ? '✓' : '✗'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">视觉:</span>
                <span className="ml-2">{group.capabilities.vision ? '✓' : '✗'}</span>
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">模型实例</h4>
                <Button size="sm" variant="outline" onClick={onAddInstance}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  添加实例
                </Button>
              </div>
              <ModelInstanceTable
                instances={instances}
                getProviderName={getProviderName}
                onEdit={onEditInstance}
                onDelete={onDeleteInstance}
                onToggle={onToggleInstance}
                onMove={onMoveInstance}
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
