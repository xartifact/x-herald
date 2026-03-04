'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Switch } from '@/ui/switch'
import { Badge } from '@/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/ui/dialog'
import { useModelGroups, useModelInstances } from '@/features/model-groups/useModelGroups'
import { useVirtualModels } from '@/features/virtual-models/useVirtualModels'
import { useCreateModelRoute, useDeleteModelRoute, useToggleModelRoute } from '../useModelRoutes'
import type { ModelRoute, RouteCondition, RouteAction } from '../types'

interface RouteRulePanelProps {
  routes: ModelRoute[]
}

const CONDITION_FIELDS = [
  { value: 'request.model', label: '模型名' },
  { value: 'context.apiKeyName', label: 'API Key 名称' },
  { value: 'context.streaming', label: '是否流式' },
  { value: 'context.hour', label: '当前小时' },
  { value: 'context.clientType', label: '客户端类型' },
]

const CONDITION_OPERATORS = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'in', label: '在列表中' },
  { value: 'starts_with', label: '开头匹配' },
  { value: 'exists', label: '存在' },
]

const ACTION_TYPES = [
  { value: 'route_to_virtual_model', label: '路由到虚拟模型' },
  { value: 'route_to_group', label: '路由到模型组' },
  { value: 'route_to_instance', label: '路由到模型实例' },
  { value: 'reject', label: '拒绝请求' },
  { value: 'fallback', label: '降级处理' },
]

export function RouteRulePanel({ routes }: RouteRulePanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const deleteRoute = useDeleteModelRoute()
  const toggleRoute = useToggleModelRoute()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">路由规则</h3>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-3 w-3" />
          添加规则
        </Button>
      </div>

      <div className="space-y-2">
        {routes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            暂无规则，请添加路由规则
          </p>
        ) : (
          routes.map((route) => (
            <div
              key={route.id}
              className="rounded-lg border p-3 text-sm space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{route.name}</span>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={route.enabled}
                    onCheckedChange={() => toggleRoute.mutate(route.id)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      if (confirm('确定删除此规则？')) {
                        deleteRoute.mutate(route.id)
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {route.conditions && route.conditions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {route.conditions.map((c, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {c.field} {c.operator} {String(c.value ?? '')}
                    </Badge>
                  ))}
                </div>
              )}
              <Badge variant="outline" className="text-xs">
                {ACTION_TYPES.find((a) => a.value === route.action.type)?.label || route.action.type}
              </Badge>
              {route.virtualModel && (
                <div className="text-xs text-muted-foreground">
                  绑定: {route.virtualModel.displayName || route.virtualModel.name}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <CreateRuleDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}

function CreateRuleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState('')
  const [virtualModelId, setVirtualModelId] = useState('')
  const [priority, setPriority] = useState(0)
  const [conditions, setConditions] = useState<RouteCondition[]>([])
  const [actionType, setActionType] = useState<RouteAction['type']>('route_to_group')
  const [actionTargetId, setActionTargetId] = useState('')
  const [actionReason, setActionReason] = useState('')

  const { data: vms = [] } = useVirtualModels()
  const { data: groups = [] } = useModelGroups()
  const { data: instances = [] } = useModelInstances()
  const createRoute = useCreateModelRoute()

  const addCondition = () => {
    setConditions([...conditions, { field: 'request.model', operator: 'eq', value: '' }])
  }

  const updateCondition = (index: number, updates: Partial<RouteCondition>) => {
    setConditions(conditions.map((c, i) => i === index ? { ...c, ...updates } : c))
  }

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!name) return
    const action: RouteAction = { type: actionType }
    if (actionTargetId) action.targetId = actionTargetId
    if (actionReason) action.reason = actionReason

    await createRoute.mutateAsync({
      name,
      virtualModelId: virtualModelId || undefined,
      priority,
      conditions,
      action,
    })
    onOpenChange(false)
    resetForm()
  }

  const resetForm = () => {
    setName('')
    setVirtualModelId('')
    setPriority(0)
    setConditions([])
    setActionType('route_to_group')
    setActionTargetId('')
    setActionReason('')
  }

  const needsTarget = actionType === 'route_to_virtual_model' || actionType === 'route_to_group' || actionType === 'route_to_instance'

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm() }}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>添加路由规则</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>规则名称 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：高峰期分流" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>绑定虚拟模型</Label>
              <Select value={virtualModelId} onValueChange={setVirtualModelId}>
                <SelectTrigger>
                  <SelectValue placeholder="可选" />
                </SelectTrigger>
                <SelectContent>
                  {vms.map((vm) => (
                    <SelectItem key={vm.id} value={vm.id}>
                      {vm.displayName || vm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>优先级</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
          </div>

          {/* 条件列表 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>匹配条件（AND）</Label>
              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="mr-1 h-3 w-3" />
                添加条件
              </Button>
            </div>
            {conditions.map((cond, index) => (
              <div key={index} className="flex gap-2 items-center">
                <Select value={cond.field} onValueChange={(v) => updateCondition(index, { field: v })}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={cond.operator} onValueChange={(v) => updateCondition(index, { operator: v as RouteCondition['operator'] })}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPERATORS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cond.operator !== 'exists' && (
                  <Input
                    className="flex-1"
                    value={String(cond.value ?? '')}
                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                    placeholder="值"
                  />
                )}
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeCondition(index)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {/* 动作配置 */}
          <div className="space-y-2">
            <Label>动作</Label>
            <Select value={actionType} onValueChange={(v) => setActionType(v as RouteAction['type'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsTarget && (
            <div className="space-y-2">
              <Label>目标</Label>
              <Select value={actionTargetId} onValueChange={setActionTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择目标..." />
                </SelectTrigger>
                <SelectContent>
                  {actionType === 'route_to_virtual_model' && vms.map((vm) => (
                    <SelectItem key={vm.id} value={vm.id}>{vm.displayName || vm.name}</SelectItem>
                  ))}
                  {actionType === 'route_to_group' && groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.displayName} ({g.name})</SelectItem>
                  ))}
                  {actionType === 'route_to_instance' && instances.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {actionType === 'reject' && (
            <div className="space-y-2">
              <Label>拒绝原因</Label>
              <Input value={actionReason} onChange={(e) => setActionReason(e.target.value)} placeholder="可选" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={!name || createRoute.isPending}>
            {createRoute.isPending ? '创建中...' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
