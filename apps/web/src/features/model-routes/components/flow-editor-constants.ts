import { ArrowDownToLine, Ban, GitBranch, Layers } from 'lucide-react'

import { ConditionNode } from './nodes/condition-node'
import { ModelTriggerNode } from './nodes/model-trigger-node'
import { StrategyNode } from './nodes/strategy-node'
import { TargetNode } from './nodes/target-node'

export const nodeTypes = {
  modelTrigger: ModelTriggerNode,
  condition: ConditionNode,
  target: TargetNode,
  reject: StrategyNode,
  fallback: StrategyNode,
}

export const NODE_TEMPLATES = [
  {
    type: 'condition',
    label: '条件节点',
    desc: '按字段匹配请求',
    icon: GitBranch,
    color: 'text-amber-600',
    defaultData: { label: '条件', field: '', operator: 'eq', value: '' },
  },
  {
    type: 'target',
    label: '目标节点',
    desc: '路由到模型组/实例',
    icon: Layers,
    color: 'text-green-600',
    defaultData: { label: '目标', actionType: 'route_to_group', targetId: '', targetName: '' },
  },
  {
    type: 'reject',
    label: '拒绝节点',
    desc: '拒绝请求返回错误',
    icon: Ban,
    color: 'text-red-600',
    defaultData: { label: '拒绝', strategyType: 'reject', reason: '' },
  },
  {
    type: 'fallback',
    label: '降级节点',
    desc: '跳过此规则继续匹配',
    icon: ArrowDownToLine,
    color: 'text-orange-600',
    defaultData: { label: '降级', strategyType: 'fallback' },
  },
] as const

export type NodeTemplate = (typeof NODE_TEMPLATES)[number]
