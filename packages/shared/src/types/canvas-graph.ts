import { z } from 'zod'

import { NodeDataSchemas, type NodeType } from './node-data'

/**
 * 画布图结构（GraphNode/GraphEdge/CanvasGraph）—— 唯一的类型/校验源。
 *
 * 这是实际持久化进 canvas_states.graph / route_rules.graph 的 JSONB 形状。
 *
 * 类型的双重设计：
 *  - 已知节点类型（NodeType）走 discriminated union，`data` 随 `type` 收窄，
 *    前端/编译器消费时不再需要 `data as {...}` 手写强制窄化；
 *  - 未知类型的节点走宽松兜底（UnknownGraphNodeSchema）——前进兼容，未知
 *    type 的旧数据不会被整体拒绝解析，只是不提供 `data` 强类型。
 */
const NodeBaseSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  style: z.record(z.string(), z.unknown()).optional(),
})

/** 已知类型的强类型节点：data 由 NodeDataByType 按 type 映射，编译期自动收窄。 */
function typedNode<T extends NodeType>(type: T, dataSchema: (typeof NodeDataSchemas)[T]) {
  return NodeBaseSchema.extend({
    type: z.literal(type),
    data: dataSchema,
  })
}

export const KnownGraphNodeSchema = z.discriminatedUnion('type', [
  typedNode('modelTrigger', NodeDataSchemas.modelTrigger),
  typedNode('condition', NodeDataSchemas.condition),
  typedNode('target', NodeDataSchemas.target),
  typedNode('intent', NodeDataSchemas.intent),
  typedNode('capability', NodeDataSchemas.capability),
  typedNode('reject', NodeDataSchemas.reject),
  typedNode('fallback', NodeDataSchemas.fallback),
])

function isKnownNodeType(type: string): type is NodeType {
  return type in NodeDataSchemas
}

/**
 * 未知类型的宽松兜底：data 保持 Record<string, unknown>。通过 superRefine
 * 拒绝"已知类型混进兜底"的情况（已知类型必须匹配上面的强类型 schema，否则
 * 视为真正的校验失败，而不是悄悄降级成宽松通过）——保持"已知类型 data 非法
 * 则整体失败"的既有语义，同时允许未知类型软失败。
 */
const UnknownGraphNodeSchema = NodeBaseSchema.extend({
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
}).superRefine((node, ctx) => {
  if (isKnownNodeType(node.type)) {
    ctx.addIssue({
      code: 'custom',
      path: ['type'],
      message: `node ${node.id}: known node type "${node.type}" fell through to unknown schema`,
    })
  }
})

export const GraphNodeSchema = z.union([KnownGraphNodeSchema, UnknownGraphNodeSchema])

export const GraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
})

export const CanvasGraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
})

export type GraphNode = z.infer<typeof GraphNodeSchema>
export type GraphEdge = z.infer<typeof GraphEdgeSchema>
export type CanvasGraph = z.infer<typeof CanvasGraphSchema>

/** 已知类型的强类型节点（判别联合收窄后），供消费方做 type 守卫。 */
export type KnownGraphNode = z.infer<typeof KnownGraphNodeSchema>

/** 运行时守卫：把 GraphNode 收窄为 KnownGraphNode（data 随之获得强类型）。 */
export function isKnownGraphNode(node: GraphNode): node is KnownGraphNode {
  return KnownGraphNodeSchema.safeParse(node).success
}

/** 把节点按已知类型解析，未知类型返回 null。 */
export function parseKnownGraphNode(node: GraphNode): KnownGraphNode | null {
  const result = KnownGraphNodeSchema.safeParse(node)
  return result.success ? result.data : null
}

/**
 * 单个接入模型在全局路由俯瞰图中的条目：接入模型元信息 + 其 active 路由规则。
 * rule 为 null 表示该接入模型尚未配置/激活任何路由规则。
 */
export interface AccessModelRouteOverviewEntry {
  accessModel: {
    id: string
    name: string
    displayName: string | null
    enabled: boolean
  }
  rule: { id: string; version: number; active: boolean } | null
  graph: CanvasGraph
}

/** 全局路由俯瞰图数据：所有接入模型的路由规则及其图结构。 */
export type AccessModelRouteOverview = AccessModelRouteOverviewEntry[]
