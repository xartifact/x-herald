'use client'

import { useEffect, useState } from 'react'

import type { Node } from '@xyflow/react'
import { Layers } from 'lucide-react'

import { useModelGroups, useModelInstances } from '@/features/model-groups/useModelGroups'
import { useVirtualModels } from '@/features/virtual-models/useVirtualModels'
import { Label } from '@/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'

const ACTION_TYPES = [
  { value: 'route_to_group', label: '路由到模型组' },
  { value: 'route_to_virtual_model', label: '路由到虚拟模型' },
  { value: 'route_to_instance', label: '路由到实例' },
]

interface TargetPropertiesProps {
  node: Node
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void
}

export function TargetProperties({ node, onUpdate }: TargetPropertiesProps) {
  const d = node.data as Record<string, unknown>
  const [actionType, setActionType] = useState((d.actionType as string) || 'route_to_group')
  const [targetId, setTargetId] = useState((d.targetId as string) || '')

  const { data: vms = [] } = useVirtualModels()
  const { data: groups = [] } = useModelGroups()
  const { data: instances = [] } = useModelInstances()

  useEffect(() => {
    setActionType((d.actionType as string) || 'route_to_group')
    setTargetId((d.targetId as string) || '')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const getTargetName = (id: string): string => {
    if (actionType === 'route_to_group') {
      const g = groups.find(x => x.id === id)
      return g?.displayName || g?.name || id
    }
    if (actionType === 'route_to_virtual_model') {
      const vm = vms.find(x => x.id === id)
      return vm?.displayName || vm?.name || id
    }
    const inst = instances.find(x => x.id === id)
    return inst?.name || id
  }

  const update = (at: string, tid: string) => {
    const targetName = tid ? getTargetName(tid) : ''
    onUpdate(node.id, {
      ...d,
      actionType: at,
      targetId: tid,
      targetName,
      targetType: at === 'route_to_group' ? 'model_group' :
                  at === 'route_to_instance' ? 'model_instance' : 'virtual_model',
      label: ACTION_TYPES.find(x => x.value === at)?.label || at,
    })
  }

  const options = actionType === 'route_to_group'
    ? groups.map(g => ({ value: g.id, label: g.displayName || g.name }))
    : actionType === 'route_to_virtual_model'
      ? vms.map(vm => ({ value: vm.id, label: vm.displayName || vm.name }))
      : instances.map(i => ({ value: i.id, label: i.name }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-600 font-semibold text-sm">
        <Layers className="h-4 w-4" />
        <span>目标节点配置</span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">动作类型</Label>
        <Select
          value={actionType}
          onValueChange={v => {
            setActionType(v)
            setTargetId('')
            update(v, '')
          }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="选择动作..." />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">路由目标</Label>
        <Select
          value={targetId}
          onValueChange={v => { setTargetId(v); update(actionType, v) }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="选择目标..." />
          </SelectTrigger>
          <SelectContent>
            {options.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {options.length === 0 && (
          <p className="text-xs text-muted-foreground">暂无可用目标</p>
        )}
      </div>
    </div>
  )
}
