'use client'

import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Layers } from 'lucide-react'
import { Button } from '@/ui/button'
import { Badge } from '@/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import type { ModelGroup } from '../types'

interface ModelGroupCardProps {
  group: ModelGroup
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onDelete: () => void
  onAddInstance: () => void
}

const ROUTING_STRATEGY_LABELS: Record<string, string> = {
  round_robin: '轮询',
  weighted: '加权',
  least_latency: '最低延迟',
  priority: '优先级',
  cost_optimized: '成本优化',
  smart: '智能路由',
}

export function ModelGroupCard({
  group,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddInstance,
}: ModelGroupCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">{group.displayName}</CardTitle>
              <p className="text-sm text-muted-foreground">{group.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
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
                <span className="text-muted-foreground">路由策略:</span>
                <Badge variant="outline" className="ml-2">
                  {ROUTING_STRATEGY_LABELS[group.routingConfig.strategy] || group.routingConfig.strategy}
                </Badge>
              </div>
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
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={onAddInstance}>
                <Plus className="mr-2 h-4 w-4" />
                添加实例
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
