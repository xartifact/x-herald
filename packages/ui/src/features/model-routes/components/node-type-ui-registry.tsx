import type { ReactNode } from 'react'
import type { Node, Edge, NodeProps } from '@xyflow/react'
import type { RJSFSchema, UiSchema } from '@rjsf/utils'
import { Ban, BrainCircuit, GitBranch, Layers, ShieldHalf, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { NodeType, NodeColorToken } from '@xartifact/x-llm-gateway-shared'
import { NODE_COLOR_HEX } from '@xartifact/x-llm-gateway-shared'

import { ConditionNode } from './nodes/condition-node'
import { ModelTriggerNode } from './nodes/model-trigger-node'
import { StrategyNode } from './nodes/strategy-node'
import { TargetNode } from './nodes/target-node'
import { IntentNode } from './nodes/intent-node'
import { CapabilityNode } from './nodes/capability-node'
import { FallbackNode } from './nodes/fallback-node'
import { RoutingReadonlyTable } from './property-panel/routing-readonly-table'
import { capabilitySchema, capabilityUiSchema } from './property-panel/schemas/capabilitySchema'
import { conditionSchema, conditionUiSchema } from './property-panel/schemas/conditionSchema'
import { intentSchema, intentUiSchema } from './property-panel/schemas/intentSchema'
import { rejectSchema, rejectUiSchema } from './property-panel/schemas/rejectSchema'
import { fallbackSchema, fallbackUiSchema } from './property-panel/schemas/fallbackSchema'
import { targetSchema, targetUiSchema } from './property-panel/schemas/targetSchema'
import { vmSchema, vmUiSchema } from './property-panel/schemas/vmSchema'

/** deriveOnChange 需要的、已从各自 TanStack Query 取到的实体列表 */
export interface EntityLookups {
  accessModels?: Array<{ id: string; name: string; displayName?: string | null }>
  modelGroups?: Array<{ id: string; name: string; displayName?: string | null }>
  modelInstances?: Array<{ id: string; name: string }>
}

export interface NodeTypeUIEntry {
  type: NodeType
  /**
   * 方法签名（而非 `component: ComponentType<NodeProps>` 字段）是刻意的：
   * 各节点组件各自的 data 形状不同（ModelTriggerData/ConditionData/...），
   * 用属性语法声明会被 TS 按逆变严格检查参数类型而报错——
   * React Flow 自己的 NodeTypes 类型定义也用 `data: any` 绕开了同样的问题。
   * 方法签名沿用 TS 对方法参数的双变检查，不需要引入 any。
   */
  component(props: NodeProps): ReactNode
  title: string
  icon: LucideIcon
  colorToken: NodeColorToken
  /** tailwind 文本色类名（JIT 扫描需要字面量 class，色板 token 只用于取十六进制值） */
  colorClassName: string
  rjsfSchema: RJSFSchema
  uiSchema: UiSchema
  /** add-node-dialog 的默认 data；modelTrigger 不可手动添加，没有这个字段 */
  templateDefaults?: Record<string, unknown>
  templateLabel?: string
  templateDesc?: string
  renderExtra?: (ctx: { node: Node; edges: Edge[]; nodes: Node[] }) => ReactNode
  deriveOnChange?: (
    next: Record<string, unknown>,
    prev: Record<string, unknown>,
    lookups: EntityLookups,
  ) => Record<string, unknown>
}

function deriveTargetOnChange(
  next: Record<string, unknown>,
  prev: Record<string, unknown>,
  lookups: EntityLookups,
): Record<string, unknown> {
  const targetIdChanged = typeof next.targetId === 'string' && next.targetId !== prev.targetId
  if (!targetIdChanged) return next

  const newTargetId = next.targetId as string
  const actionType = (next.actionType as string | undefined) ?? ''
  let newName = '未指定'
  let newType: 'access_model' | 'model_group' | 'model_instance' | undefined

  if (actionType === 'route_to_access_model' || actionType === 'route_to_virtual_model') {
    const am = lookups.accessModels?.find((a) => a.id === newTargetId)
    if (am) {
      newName = am.displayName || am.name
      newType = 'access_model'
    }
  } else if (actionType === 'route_to_group') {
    const g = lookups.modelGroups?.find((x) => x.id === newTargetId)
    if (g) {
      newName = g.displayName || g.name
      newType = 'model_group'
    }
  } else if (actionType === 'route_to_instance') {
    const inst = lookups.modelInstances?.find((i) => i.id === newTargetId)
    if (inst) {
      newName = inst.name
      newType = 'model_instance'
    }
  }

  return {
    ...next,
    targetName: newName,
    ...(newType ? { targetType: newType } : {}),
  }
}

function renderRoutingTable(ctx: { node: Node; edges: Edge[]; nodes: Node[] }): ReactNode {
  return <RoutingReadonlyTable node={ctx.node} edges={ctx.edges} nodes={ctx.nodes} />
}

/**
 * 每种节点类型的前端配置：画布渲染组件 + RJSF schema/uiSchema + add-node 模板默认值
 * + 属性面板的特例插槽（renderExtra / deriveOnChange）。
 * 替代原来分散在 flow-editor-constants.ts（nodeTypes/NODE_TEMPLATES）、
 * property-panel/index.tsx（NODE_TYPE_CONFIG + 内联 handleChange 特例）里的
 * 按 node.type 字符串重复维护的多份配置。
 */
export const NodeTypeUIRegistry: Record<NodeType, NodeTypeUIEntry> = {
  modelTrigger: {
    type: 'modelTrigger',
    component: ModelTriggerNode,
    title: '接入模型',
    icon: Layers,
    colorToken: 'blue',
    colorClassName: 'text-blue-600',
    rjsfSchema: vmSchema,
    uiSchema: vmUiSchema as UiSchema,
  },
  condition: {
    type: 'condition',
    component: ConditionNode,
    title: '条件节点',
    icon: GitBranch,
    colorToken: 'amber',
    colorClassName: 'text-amber-600',
    rjsfSchema: conditionSchema,
    uiSchema: conditionUiSchema,
    templateDefaults: { label: '条件', field: '', operator: 'eq', value: '' },
    templateLabel: '条件节点',
    templateDesc: '按字段匹配请求',
  },
  target: {
    type: 'target',
    component: TargetNode,
    title: '目标节点',
    icon: Layers,
    colorToken: 'green',
    colorClassName: 'text-green-600',
    rjsfSchema: targetSchema,
    uiSchema: targetUiSchema,
    templateDefaults: { label: '目标', actionType: 'route_to_group', targetId: '', targetName: '' },
    templateLabel: '目标节点',
    templateDesc: '路由到模型组/实例',
    deriveOnChange: deriveTargetOnChange,
  },
  intent: {
    type: 'intent',
    component: IntentNode,
    title: '意图路由',
    icon: BrainCircuit,
    colorToken: 'violet',
    colorClassName: 'text-violet-600',
    rjsfSchema: intentSchema,
    uiSchema: intentUiSchema,
    templateDefaults: { label: '意图路由', intentConfig: { categories: [] } },
    templateLabel: '意图路由',
    templateDesc: '小模型分类意图后路由',
    renderExtra: renderRoutingTable,
  },
  capability: {
    type: 'capability',
    component: CapabilityNode,
    title: '能力路由',
    icon: Sparkles,
    colorToken: 'cyan',
    colorClassName: 'text-cyan-600',
    rjsfSchema: capabilitySchema,
    uiSchema: capabilityUiSchema,
    templateDefaults: { label: '能力路由', capabilityConfig: { capabilities: [] } },
    templateLabel: '能力路由',
    templateDesc: '按内容能力路由（视觉/音频/视频）',
    renderExtra: renderRoutingTable,
  },
  reject: {
    type: 'reject',
    component: StrategyNode,
    title: '策略节点',
    icon: Ban,
    colorToken: 'red',
    colorClassName: 'text-red-600',
    rjsfSchema: rejectSchema,
    uiSchema: rejectUiSchema,
    templateDefaults: { label: '拒绝', strategyType: 'reject', reason: '' },
    templateLabel: '拒绝节点',
    templateDesc: '拒绝请求返回错误',
  },
  fallback: {
    type: 'fallback',
    component: FallbackNode,
    title: '降级链（主备）',
    icon: ShieldHalf,
    colorToken: 'purple',
    colorClassName: 'text-purple-600',
    rjsfSchema: fallbackSchema,
    uiSchema: fallbackUiSchema,
    templateDefaults: { label: '降级链' },
    templateLabel: '降级链（主备）',
    templateDesc: '主出口失败时降级到备出口',
  },
}

export function isNodeType(type: string | undefined): type is NodeType {
  return type !== undefined && type in NodeTypeUIRegistry
}

export function getNodeColorHex(type: string): string {
  if (!isNodeType(type)) return NODE_COLOR_HEX.blue
  return NODE_COLOR_HEX[NodeTypeUIRegistry[type].colorToken]
}
