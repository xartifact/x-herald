'use client'

import { X, Edit2, Trash2, Power, PowerOff } from 'lucide-react'

import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { ScrollArea } from '@/ui/scroll-area'
import { Separator } from '@/ui/separator'

import type { ModelRoute } from '../types'

// 字段中文标签映射
const FIELD_LABELS: Record<string, string> = {
  'request.model': '模型名',
  'context.apiKeyName': 'API Key 名称',
  'context.streaming': '是否流式',
  'context.hour': '当前小时',
  'context.clientType': '客户端类型',
}

// 操作符中文标签映射
const OPERATOR_LABELS: Record<string, string> = {
  'eq': '等于',
  'ne': '不等于',
  'in': '在列表中',
  'starts_with': '开头匹配',
  'exists': '存在',
}

// 动作中文标签映射
const ACTION_LABELS: Record<string, string> = {
  'route_to_virtual_model': '路由到虚拟模型',
  'route_to_group': '路由到模型组',
  'route_to_instance': '路由到模型实例',
  'reject': '拒绝请求',
  'fallback': '降级处理',
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

interface RuleDetailPanelProps {
  route: ModelRoute | null
  vms: VirtualModel[]
  groups: ModelGroup[]
  instances: ModelInstance[]
  onClose: () => void
  onEdit: (route: ModelRoute) => void
  onDelete: (route: ModelRoute) => void
  onToggle: (route: ModelRoute) => void
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

export function RuleDetailPanel({ 
  route, 
  vms,
  groups,
  instances,
  onClose, 
  onEdit, 
  onDelete, 
  onToggle 
}: RuleDetailPanelProps) {
  if (!route) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6">
        <div className="text-center space-y-2">
          <p className="text-sm">点击 Flow 图中的节点</p>
          <p className="text-xs">或规则列表中的规则查看详情</p>
        </div>
      </div>
    )
  }

  const formatCondition = (cond: { field: string; operator: string; value?: unknown }) => {
    const fieldLabel = FIELD_LABELS[cond.field] || cond.field
    const operatorLabel = OPERATOR_LABELS[cond.operator] || cond.operator
    const value = cond.operator === 'exists' ? '' : ` "${String(cond.value ?? '')}"`
    return `${fieldLabel} ${operatorLabel}${value}`
  }

  const formatAction = (action: ModelRoute['action']) => {
    const typeLabel = ACTION_LABELS[action.type] || action.type
    const targetName = getTargetName(action.type, action.targetId, vms, groups, instances)
    
    if (action.type === 'reject' && action.reason) {
      return `${typeLabel} (${action.reason})`
    }
    
    if (action.targetId) {
      return `${typeLabel}: ${targetName}`
    }
    
    return typeLabel
  }

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">规则详情</h3>
          {route.enabled ? (
            <Badge variant="default" className="text-xs bg-green-500">启用</Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">禁用</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 内容 */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* 基本信息 */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              基本信息
            </h4>
            
            <div className="space-y-2">
              <div>
                <span className="text-xs text-muted-foreground">规则名称</span>
                <p className="text-sm font-medium">{route.name}</p>
              </div>
              
              {route.description && (
                <div>
                  <span className="text-xs text-muted-foreground">描述</span>
                  <p className="text-sm">{route.description}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">优先级</span>
                  <p className="text-sm font-medium">{route.priority}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">状态</span>
                  <p className="text-sm font-medium">{route.enabled ? '启用' : '禁用'}</p>
                </div>
              </div>
              
              {route.virtualModelIds && route.virtualModelIds.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">绑定虚拟模型</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {route.virtualModelIds.map((vmId) => {
                      const vm = vms.find(v => v.id === vmId)
                      return (
                        <Badge key={vmId} variant="outline" className="text-xs">
                          {vm ? (vm.displayName || vm.name) : vmId}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* 条件 */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              匹配条件
            </h4>
            
            {route.conditions && route.conditions.length > 0 ? (
              <div className="space-y-2">
                {route.conditions.map((cond, index) => (
                  <div 
                    key={index} 
                    className="bg-muted/50 rounded px-3 py-2 text-sm"
                  >
                    <Badge variant="outline" className="text-xs mr-2">
                      条件 {index + 1}
                    </Badge>
                    {formatCondition(cond)}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-2">
                  满足所有条件时执行动作（AND）
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground bg-muted/30 rounded p-3">
                无条件限制，始终匹配
              </p>
            )}
          </div>

          <Separator />

          {/* 动作 */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              执行动作
            </h4>
            
            <div className="bg-muted/50 rounded px-3 py-2">
              <Badge 
                variant={route.action.type === 'reject' ? 'destructive' : 'default'}
                className="text-xs mb-1"
              >
                {ACTION_LABELS[route.action.type] || route.action.type}
              </Badge>
              <p className="text-sm">
                {formatAction(route.action)}
              </p>
            </div>
          </div>

          {/* 元信息 */}
          <div className="pt-4 border-t">
            <div className="text-xs text-muted-foreground space-y-1">
              <p>ID: <span className="font-mono">{route.id}</span></p>
              <p>创建: {new Date(route.createdAt).toLocaleString()}</p>
              <p>更新: {new Date(route.updatedAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* 底部操作按钮 */}
      <div className="p-4 border-t shrink-0 space-y-2">
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => onToggle(route)}
          >
            {route.enabled ? (
              <>
                <PowerOff className="mr-2 h-4 w-4" />
                禁用
              </>
            ) : (
              <>
                <Power className="mr-2 h-4 w-4" />
                启用
              </>
            )}
          </Button>
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => onEdit(route)}
          >
            <Edit2 className="mr-2 h-4 w-4" />
            编辑
          </Button>
        </div>
        <Button 
          variant="destructive" 
          className="w-full"
          onClick={() => onDelete(route)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          删除规则
        </Button>
      </div>
    </div>
  )
}
