import { NodeDataSchemas, parseNodeData, type NodeDataByType, type NodeType } from './node-data'
import type { GraphEdge, GraphNode } from './canvas-graph'

/**
 * 节点 source handle 规格 —— 绑定的节点类型参数 T 让 dynamic 的取值器
 * 直接拿到 NodeDataByType[T]，不再用字符串 path（消除"拼错不报错"的隐患）。
 *
 *   - none:     无 source handle（target / reject，RouteAction 终结叶子）
 *   - single:   单一匿名 source handle（modelTrigger）
 *   - condition: 固定两个具名 handle（true / false）
 *   - fallback: 固定两个具名 handle（handle-primary / handle-backup）
 *   - dynamic:  handle 数量由 data 里某个字符串数组驱动，外加一个兜底
 *               （intent 的 intentConfig.categories / capability 的 capabilities）
 */
export type HandleSpec<T extends NodeType> =
  | { kind: 'none' }
  | { kind: 'single' }
  | { kind: 'condition' }
  | { kind: 'fallback' }
  | {
      kind: 'dynamic'
      /** 从该类型的强类型 data 中取出驱动 handle 数量的字符串列表。 */
      getHandleList: (data: NodeDataByType[T]) => string[]
      defaultHandle: string
    }

/**
 * 画布节点色板 token —— 对应 docs/ui-consistency-spec.md 锁定的 7 种节点配色
 * （请求入口=blue、目标=green、条件=amber、意图=violet、能力=cyan、拒绝=red、兜底=purple）。
 * 新增节点类型时在这里加一个 token + 十六进制值，替代过去散落在
 * flow-editor.tsx MiniMap nodeColor switch 里的字符串分支。
 */
export type NodeColorToken = 'blue' | 'amber' | 'green' | 'red' | 'purple' | 'violet' | 'cyan'

export const NODE_COLOR_HEX: Record<NodeColorToken, string> = {
  blue: '#3b82f6',
  amber: '#f59e0b',
  green: '#22c55e',
  red: '#ef4444',
  purple: '#a855f7',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
}

export interface NodeTypeSchemaEntry<T extends NodeType> {
  type: T
  dataSchema: (typeof NodeDataSchemas)[T]
  handles: HandleSpec<T>
  /** 是否是编译器里的"叶子"类型（会产出 RouteAction），对应 canvas-route-engine.ts 的 leaf-type 判断 */
  isLeaf: boolean
  colorToken: NodeColorToken
  /**
   * 结构性校验（泛化自 compile-flow.ts 的 validateFlow 里逐类型分支）。
   * data 为该节点类型的强类型数据（由 NodeDataByType[T] 推导，无需 `data as {...}`）。
   * presentHandles: 该节点身上「实际有出边连接」的 sourceHandle 集合，由调用方基于 edges 算出。
   */
  validate?: (data: NodeDataByType[T], presentHandles: Set<string>) => string[]
}

type NodeTypeRegistryShape = { [K in NodeType]: NodeTypeSchemaEntry<K> }

export const NodeTypeRegistry: NodeTypeRegistryShape = {
  modelTrigger: {
    type: 'modelTrigger',
    dataSchema: NodeDataSchemas.modelTrigger,
    handles: { kind: 'single' },
    isLeaf: false,
    colorToken: 'blue',
  },
  condition: {
    type: 'condition',
    dataSchema: NodeDataSchemas.condition,
    handles: { kind: 'condition' },
    isLeaf: false,
    colorToken: 'amber',
    validate: (data) => (!data.field || !data.operator ? ['条件节点未配置字段或操作符'] : []),
  },
  target: {
    type: 'target',
    dataSchema: NodeDataSchemas.target,
    handles: { kind: 'none' },
    isLeaf: true,
    colorToken: 'green',
    validate: (data) => (!data.actionType || !data.targetId ? ['目标节点未配置动作或目标'] : []),
  },
  reject: {
    type: 'reject',
    dataSchema: NodeDataSchemas.reject,
    handles: { kind: 'none' },
    isLeaf: true,
    colorToken: 'red',
  },
  fallback: {
    type: 'fallback',
    dataSchema: NodeDataSchemas.fallback,
    handles: { kind: 'fallback' },
    isLeaf: true,
    colorToken: 'purple',
    validate: (_data, presentHandles) => {
      const errors: string[] = []
      if (!presentHandles.has('handle-primary'))
        errors.push('降级链节点未连接主出口 (handle-primary)')
      if (!presentHandles.has('handle-backup'))
        errors.push('降级链节点未连接备出口 (handle-backup)')
      return errors
    },
  },
  intent: {
    type: 'intent',
    dataSchema: NodeDataSchemas.intent,
    handles: {
      kind: 'dynamic',
      getHandleList: (data) => data.intentConfig?.categories ?? [],
      defaultHandle: 'handle-default',
    },
    isLeaf: true,
    colorToken: 'violet',
    validate: (data) => {
      const categories = data.intentConfig?.categories ?? []
      return categories.length === 0 ? ['意图节点未配置任何分类'] : []
    },
  },
  capability: {
    type: 'capability',
    dataSchema: NodeDataSchemas.capability,
    handles: {
      kind: 'dynamic',
      getHandleList: (data) => data.capabilityConfig?.capabilities ?? [],
      defaultHandle: 'handle-default',
    },
    isLeaf: true,
    colorToken: 'cyan',
    validate: (data) => {
      const capabilities = data.capabilityConfig?.capabilities ?? []
      return capabilities.length === 0 ? ['能力节点未配置任何能力'] : []
    },
  },
}

/**
 * 该节点类型当前合法的 source handle id 集合。
 * data 以 unknown 传入（DB JSONB / xyflow 弱类型），在 dynamic 分支内部用
 * getHandleList（编译期已按 NodeDataByType[T] 收窄）取值，不再手写字符串 path。
 */
export function getValidHandleIds(type: NodeType, data: unknown): Set<string> {
  const { handles } = NodeTypeRegistry[type]
  switch (handles.kind) {
    case 'none':
    case 'single':
      return new Set()
    case 'condition':
      return new Set(['true', 'false'])
    case 'fallback':
      return new Set(['handle-primary', 'handle-backup'])
    case 'dynamic': {
      // type 已在 registry 查找时确定，handles.getHandleList 期望的是该类型的
      // 强类型 data；运行时 data 可能不匹配（脏数据），getHandleList 内部用
      // 可选链安全回落空数组。
      const raw = handles.getHandleList(data as never) ?? []
      const list = Array.isArray(raw) ? (raw as string[]) : []
      const ids = new Set(list.map((v) => `handle-${v}`))
      ids.add(handles.defaultHandle)
      return ids
    }
  }
}

/**
 * 用该节点类型的强类型 data 跑结构性校验。
 * data 以 unknown 传入（xyflow/DB 弱类型），内部用 parseNodeData 收窄为
 * NodeDataByType[T]（T 由 registry entry 的类型推导），校验免去 `data as {...}`。
 * 解析失败（data 不符合该类型 schema）视为校验错误。
 */
export function validateNodeData(
  type: NodeType,
  data: unknown,
  presentHandles: Set<string>,
): string[] {
  const entry = NodeTypeRegistry[type]
  if (!entry.validate) return []
  const parsed = parseNodeData(type, data)
  if (!parsed) return ['节点数据无效']
  // type 决定走哪个 entry，entry.validate 期望该类型的强类型 data。parseNodeData
  // 已按 type 的 schema 校验通过，这里的断言只表达"运行时 type → 该 entry 的
  // data 形状"这一对关系，是类型脊柱里唯一的窄化点（其余消费方不再手写）。
  return (entry.validate as (d: typeof parsed, h: Set<string>) => string[])(parsed, presentHandles)
}

/**
 * 沿着某个具名 source handle 的出边，解析出它连接到的目标节点。
 * 泛化自 canvas-route-engine.ts 的 resolveHandleTargetId —— 必须走边，
 * 不能直接读 node.data（intent/capability 的目标映射从不存在于节点自身 data 里，
 * 这正是 intent 路由曾经失效的根因）。
 */
export function resolveHandleTarget(
  nodeId: string,
  handleId: string,
  outEdges: Map<string, GraphEdge[]>,
  nodeMap: Map<string, GraphNode>,
): GraphNode | undefined {
  const edges = outEdges.get(nodeId) ?? []
  const edge = edges.find((e) => e.sourceHandle === handleId)
  if (!edge) return undefined
  return nodeMap.get(edge.target)
}
