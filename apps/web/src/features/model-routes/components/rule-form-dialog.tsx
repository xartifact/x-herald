'use client'

import { useState, useEffect } from 'react'

import { Plus, Trash2, X } from 'lucide-react'

import { useModelGroups, useModelInstances } from '@/features/model-groups/useModelGroups'
import { useVirtualModels } from '@/features/virtual-models/useVirtualModels'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/ui/dialog'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import { Switch } from '@/ui/switch'

import type { ModelRoute, RouteCondition, RouteAction } from '../types'
import { useCreateModelRoute, useUpdateModelRoute } from '../useModelRoutes'

// 特殊值常量
const NONE_VALUE = '__none__'

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

// 可用字段列表
const CONDITION_FIELDS = [
  { value: 'request.model', label: FIELD_LABELS['request.model'] },
  { value: 'context.apiKeyName', label: FIELD_LABELS['context.apiKeyName'] },
  { value: 'context.streaming', label: FIELD_LABELS['context.streaming'] },
  { value: 'context.hour', label: FIELD_LABELS['context.hour'] },
  { value: 'context.clientType', label: FIELD_LABELS['context.clientType'] },
]

// 可用操作符列表
const CONDITION_OPERATORS = [
  { value: 'eq', label: OPERATOR_LABELS['eq'] },
  { value: 'ne', label: OPERATOR_LABELS['ne'] },
  { value: 'in', label: OPERATOR_LABELS['in'] },
  { value: 'starts_with', label: OPERATOR_LABELS['starts_with'] },
  { value: 'exists', label: OPERATOR_LABELS['exists'] },
]

// 可用动作列表
const ACTION_TYPES = [
  { value: 'route_to_virtual_model', label: ACTION_LABELS['route_to_virtual_model'] },
  { value: 'route_to_group', label: ACTION_LABELS['route_to_group'] },
  { value: 'route_to_instance', label: ACTION_LABELS['route_to_instance'] },
  { value: 'reject', label: ACTION_LABELS['reject'] },
  { value: 'fallback', label: ACTION_LABELS['fallback'] },
]

interface RuleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingRoute?: ModelRoute | null
  onSaved?: () => void
}

export function RuleFormDialog({ open, onOpenChange, editingRoute, onSaved }: RuleFormDialogProps) {
  const isEditing = !!editingRoute
  
  // 表单状态
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [virtualModelIds, setVirtualModelIds] = useState<string[]>([])
  const [addVmValue, setAddVmValue] = useState(NONE_VALUE)
  const [priority, setPriority] = useState(0)
  const [enabled, setEnabled] = useState(true)
  const [conditions, setConditions] = useState<RouteCondition[]>([])
  const [actionType, setActionType] = useState<RouteAction['type']>('route_to_group')
  const [actionTargetId, setActionTargetId] = useState(NONE_VALUE)
  const [actionReason, setActionReason] = useState('')

  // 数据获取
  const { data: vms = [] } = useVirtualModels()
  const { data: groups = [] } = useModelGroups()
  const { data: instances = [] } = useModelInstances()
  
  // Mutations
  const createRoute = useCreateModelRoute()
  const updateRoute = useUpdateModelRoute()

  // 当 editingRoute 变化时，预填充表单
  useEffect(() => {
    if (editingRoute) {
      setName(editingRoute.name)
      setDescription(editingRoute.description || '')
      setVirtualModelIds(editingRoute.virtualModelIds || [])
      setPriority(editingRoute.priority)
      setEnabled(editingRoute.enabled)
      setConditions(editingRoute.conditions || [])
      setActionType(editingRoute.action.type)
      setActionTargetId(editingRoute.action.targetId || NONE_VALUE)
      setActionReason(editingRoute.action.reason || '')
    } else {
      resetForm()
    }
  }, [editingRoute])

  // 当对话框关闭时重置表单
  useEffect(() => {
    if (!open && !editingRoute) {
      resetForm()
    }
  }, [open, editingRoute])

  const resetForm = () => {
    setName('')
    setDescription('')
    setVirtualModelIds([])
    setAddVmValue(NONE_VALUE)
    setPriority(0)
    setEnabled(true)
    setConditions([])
    setActionType('route_to_group')
    setActionTargetId(NONE_VALUE)
    setActionReason('')
  }

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
    const targetId = actionTargetId === NONE_VALUE ? undefined : actionTargetId
    if (targetId) action.targetId = targetId
    if (actionReason) action.reason = actionReason

    const payload = {
      name,
      description: description || undefined,
      virtualModelIds,
      priority,
      enabled,
      conditions,
      action,
    }

    try {
      if (isEditing && editingRoute) {
        await updateRoute.mutateAsync({ id: editingRoute.id, data: payload })
      } else {
        await createRoute.mutateAsync(payload)
      }
      onSaved?.()
      onOpenChange(false)
      if (!isEditing) {
        resetForm()
      }
    } catch {
      // onError handler in mutation already shows toast
    }
  }

  const needsTarget = actionType === 'route_to_virtual_model' || 
                      actionType === 'route_to_group' || 
                      actionType === 'route_to_instance'

  const isPending = createRoute.isPending || updateRoute.isPending

  // 获取当前目标列表
  const getTargetOptions = () => {
    switch (actionType) {
      case 'route_to_virtual_model':
        return vms.map((vm) => ({ value: vm.id, label: vm.displayName || vm.name }))
      case 'route_to_group':
        return groups.map((g) => ({ value: g.id, label: `${g.displayName} (${g.name})` }))
      case 'route_to_instance':
        return instances.map((inst) => ({ value: inst.id, label: inst.name }))
      default:
        return []
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { 
      onOpenChange(v) 
      if (!v && !isEditing) {
        resetForm()
      }
    }}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? '编辑路由规则' : '添加路由规则'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 基本信息 */}
          <div className="space-y-2">
            <Label>规则名称 *</Label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="例：高峰期分流规则"
            />
          </div>

          <div className="space-y-2">
            <Label>描述</Label>
            <Input 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder="可选，描述此规则的作用"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>绑定虚拟模型</Label>
              <div className="flex flex-wrap gap-1 min-h-[32px] p-1 border rounded bg-background">
                {virtualModelIds.map((vmId) => {
                  const vm = vms.find(v => v.id === vmId)
                  if (!vm) return null
                  return (
                    <Badge key={vmId} variant="secondary" className="gap-1 text-xs">
                      {vm.displayName || vm.name}
                      <button
                        type="button"
                        className="ml-0.5 hover:text-destructive"
                        onClick={() => setVirtualModelIds(prev => prev.filter(id => id !== vmId))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )
                })}
                {virtualModelIds.length === 0 && (
                  <span className="text-xs text-muted-foreground px-1 py-0.5">全局规则</span>
                )}
              </div>
              <Select value={addVmValue} onValueChange={(v) => {
                if (v !== NONE_VALUE && !virtualModelIds.includes(v)) {
                  setVirtualModelIds([...virtualModelIds, v])
                }
                setAddVmValue(NONE_VALUE)
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="添加虚拟模型..." />
                </SelectTrigger>
                <SelectContent>
                  {vms.filter(vm => !virtualModelIds.includes(vm.id)).map((vm) => (
                    <SelectItem key={vm.id} value={vm.id}>
                      {vm.displayName || vm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>优先级</Label>
              <Input 
                type="number" 
                value={priority} 
                onChange={(e) => setPriority(Number(e.target.value))}
                min={0}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label className="cursor-pointer">启用此规则</Label>
          </div>

          {/* 条件列表 */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-base">匹配条件</Label>
              <span className="text-xs text-muted-foreground">满足所有条件时执行动作（AND）</span>
            </div>
            
            {conditions.length === 0 ? (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3 text-center">
                无条件，始终匹配
              </div>
            ) : (
              <div className="space-y-2">
                {conditions.map((cond, index) => (
                  <div key={index} className="flex gap-2 items-start bg-muted/30 rounded p-2">
                    <Select 
                      value={cond.field} 
                      onValueChange={(v) => updateCondition(index, { field: v })}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITION_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Select 
                      value={cond.operator} 
                      onValueChange={(v) => updateCondition(index, { operator: v as RouteCondition['operator'] })}
                    >
                      <SelectTrigger className="w-[110px]">
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
                    
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-9 w-9 p-0 shrink-0" 
                      onClick={() => removeCondition(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            
            <Button variant="outline" size="sm" onClick={addCondition} className="w-full">
              <Plus className="mr-1 h-3 w-3" />
              添加条件
            </Button>
          </div>

          {/* 动作配置 */}
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-base">执行动作</Label>
            
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

            {needsTarget && (
              <div className="space-y-2 pt-2">
                <Label>目标</Label>
                <Select 
                  value={actionTargetId} 
                  onValueChange={setActionTargetId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择目标..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>-- 请选择 --</SelectItem>
                    {getTargetOptions().map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {actionType === 'reject' && (
              <div className="space-y-2 pt-2">
                <Label>拒绝原因（可选）</Label>
                <Input 
                  value={actionReason} 
                  onChange={(e) => setActionReason(e.target.value)} 
                  placeholder="可选，返回给客户端的错误信息"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!name || isPending || (needsTarget && actionTargetId === NONE_VALUE)}
          >
            {isPending ? (isEditing ? '保存中...' : '创建中...') : (isEditing ? '保存' : '创建')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
