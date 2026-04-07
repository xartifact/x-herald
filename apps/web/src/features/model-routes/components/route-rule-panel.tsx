'use client'

import { Plus, Trash2, Edit2 } from 'lucide-react'

import { cn } from '@/core/lib/utils'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { ScrollArea } from '@/ui/scroll-area'
import { Switch } from '@/ui/switch'

import type { ModelRoute, RouteCondition } from '../types'

// 字段中文标签映射
const FIELD_LABELS: Record<string, string> = {
  'request.model': '模型名',
  'context.apiKeyName': 'API Key',
  'context.streaming': '流式',
  'context.hour': '小时',
  'context.clientType': '客户端',
}

// 操作符中文标签映射
const OPERATOR_LABELS: Record<string, string> = {
  'eq': '=',
  'ne': '≠',
  'in': '∈',
  'starts_with': '前缀',
  'exists': '存在',
}

// 动作中文标签映射
const ACTION_LABELS: Record<string, string> = {
  'route_to_virtual_model': '虚拟模型',
  'route_to_group': '模型组',
  'route_to_instance': '实例',
  'reject': '拒绝',
  'fallback': '降级',
}

// 数据类型定义
interface VirtualModel {
  id: string
  name: string
  displayName: string | null
}

interface ModelGroup {
  id: string
  name: string
  displayName: string | null
}

interface ModelInstance {
  id: string
  name: string
}

interface RouteRulePanelProps {
  routes: ModelRoute[]
  vms: VirtualModel[]
  groups: ModelGroup[]
  instances: ModelInstance[]
  selectedRouteId?: string | null
  onSelect?: (route: ModelRoute) => void
  onCreate?: () => void
  onEdit?: (route: ModelRoute) => void
  onDelete?: (route: ModelRoute) => void
  onToggle?: (route: ModelRoute) => void
}

function formatCondition(cond: RouteCondition): string {
  const field = FIELD_LABELS[cond.field] || cond.field
  const op = OPERATOR_LABELS[cond.operator] || cond.operator
  const value = cond.operator === 'exists' ? '' : ` ${cond.value}`
  return `${field}${op}${value}`
}

// 获取目标名称
function getTargetName(
  actionType: string,
  targetId: string | undefined,
  vms: VirtualModel[],
  groups: ModelGroup[],
  instances: ModelInstance[]
): string {
  if (!targetId) return '未指定'
  
  switch (actionType) {
    case 'route_to_virtual_model': {
      const vm = vms.find(v => v.id === targetId)
      return vm ? (vm.displayName || vm.name) : targetId
    }
    case 'route_to_group': {
      const group = groups.find(g => g.id === targetId)
      return group ? (group.displayName || group.name) : targetId
    }
    case 'route_to_instance': {
      const inst = instances.find(i => i.id === targetId)
      return inst ? inst.name : targetId
    }
    default:
      return '未指定'
  }
}

export function RouteRulePanel({ 
  routes, 
  vms,
  groups,
  instances,
  selectedRouteId,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  onToggle,
}: RouteRulePanelProps) {
  // 按优先级排序
  const sortedRoutes = [...routes].sort((a, b) => a.priority - b.priority)

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <h3 className="text-sm font-semibold">
          路由规则 
          <span className="text-xs font-normal text-muted-foreground ml-1">
            ({routes.length})
          </span>
        </h3>
        <Button size="sm" variant="outline" onClick={onCreate}>
          <Plus className="mr-1 h-3 w-3" />
          添加
        </Button>
      </div>

      {/* 规则列表 */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {sortedRoutes.length === 0 ? (
            <div className="text-center py-8 px-4">
              <p className="text-sm text-muted-foreground mb-2">暂无路由规则</p>
              <p className="text-xs text-muted-foreground">
                点击右上角"添加"创建第一个规则
              </p>
            </div>
          ) : (
            sortedRoutes.map((route) => {
              const isSelected = selectedRouteId === route.id
              const targetName = getTargetName(
                route.action.type,
                route.action.targetId,
                vms,
                groups,
                instances
              )
              
              return (
                <div
                  key={route.id}
                  onClick={() => onSelect?.(route)}
                  className={cn(
                    "rounded-lg border p-3 text-sm cursor-pointer transition-all",
                    isSelected 
                      ? "border-blue-500 bg-blue-50/50 shadow-sm" 
                      : "hover:border-gray-300 hover:bg-gray-50"
                  )}
                >
                  {/* 标题行 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{route.name}</span>
                        {!route.enabled && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">
                            禁用
                          </Badge>
                        )}
                      </div>
                      {route.virtualModel && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          绑定: {route.virtualModel.displayName || route.virtualModel.name}
                        </div>
                      )}
                    </div>
                    
                    {/* 优先级标记 */}
                    <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                      P{route.priority}
                    </Badge>
                  </div>

                  {/* 条件摘要 */}
                  {route.conditions && route.conditions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {route.conditions.slice(0, 2).map((c, i) => (
                        <Badge 
                          key={i} 
                          variant="secondary" 
                          className="text-[10px] font-normal"
                        >
                          {formatCondition(c)}
                        </Badge>
                      ))}
                      {route.conditions.length > 2 && (
                        <Badge variant="secondary" className="text-[10px]">
                          +{route.conditions.length - 2}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* 动作和目标 */}
                  <div className="mt-2 text-xs">
                    <span className="text-muted-foreground">→ </span>
                    <Badge 
                      variant={route.action.type === 'reject' ? 'destructive' : 'default'}
                      className="text-[10px] mr-1"
                    >
                      {ACTION_LABELS[route.action.type] || route.action.type}
                    </Badge>
                    {route.action.type !== 'reject' && route.action.type !== 'fallback' && (
                      <span className="text-muted-foreground">{targetName}</span>
                    )}
                  </div>

                  {/* 快捷操作 */}
                  <div 
                    className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-dashed"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Switch
                      checked={route.enabled}
                      onCheckedChange={() => onToggle?.(route)}
                      className="scale-75"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => onEdit?.(route)}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                      onClick={() => onDelete?.(route)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

      {/* 底部提示 */}
      {sortedRoutes.length > 0 && (
        <div className="p-2 border-t text-xs text-muted-foreground text-center shrink-0">
          点击规则查看详情
        </div>
      )}
    </div>
  )
}
