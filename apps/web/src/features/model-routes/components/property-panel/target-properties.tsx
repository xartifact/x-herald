'use client'

import { useEffect, useState } from 'react'

import type { Node } from '@xyflow/react'
import { Layers } from 'lucide-react'

import { useAccessModels } from '@/features/access-models/useAccessModels'
import { useModelGroups, useModelInstances } from '@/features/model-groups/useModelGroups'
import { Label } from '@x-llm-gateway/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@x-llm-gateway/ui'

const ACTION_TYPES = [
  { value: 'route_to_group', label: '路由到模型组' },
  { value: 'route_to_instance', label: '路由到实例' },
]

interface TargetNodeData {
  actionType?: string;
  targetId?: string;
  targetName?: string;
  targetType?: string;
  label?: string;
  [key: string]: unknown;
}

interface TargetPropertiesProps {
  node: Node<TargetNodeData>;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}

export function TargetProperties({ node, onUpdate }: TargetPropertiesProps) {
  const [actionType, setActionType] = useState(node.data.actionType ?? 'route_to_group')
  const [targetId, setTargetId] = useState(node.data.targetId ?? '')

  const { data: vms = [] } = useAccessModels()
  const { data: groups = [] } = useModelGroups()
  const { data: instances = [] } = useModelInstances()

  useEffect(() => {
    setActionType(node.data.actionType ?? 'route_to_group')
    setTargetId(node.data.targetId ?? '')
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const getTargetName = (id: string): string => {
    if (actionType === 'route_to_group') {
      const g = groups.find(x => x.id === id)
      return g?.displayName || g?.name || id
    }
    if (actionType === 'route_to_access_model') {
      const vm = vms.find(x => x.id === id)
      return vm?.displayName || vm?.name || id
    }
    const inst = instances.find(x => x.id === id)
    return inst?.name || id
  }

  const update = (at: string, tid: string) => {
    const targetName = tid ? getTargetName(tid) : ''
    onUpdate(node.id, {
      ...node.data,
      actionType: at,
      targetId: tid,
      targetName,
      targetType: at === 'route_to_group' ? 'model_group' :
                  at === 'route_to_instance' ? 'model_instance' : 'access_model',
      label: ACTION_TYPES.find(x => x.value === at)?.label || at,
    })
  }

  const options = actionType === 'route_to_group'
    ? groups.map(g => ({ value: g.id, label: g.displayName || g.name }))
    : actionType === 'route_to_access_model'
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
