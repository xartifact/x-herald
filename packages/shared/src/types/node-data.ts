import { z } from 'zod'

import { IntentClassifierConfigSchema } from './model-route'

/**
 * 画布节点 data 的 Zod schema —— 单一类型源
 *
 * 设计原则:
 *   - 每个 node type 都有自己的 data 形状
 *   - 字段都可选 (default 缺失),匹配 RJSF 渲染时的"未填写"状态
 *   - NodeDataByType registry 给出 Node<T> 强类型映射
 *   - z.infer 出 TS 类型,前后端共享
 *
 * 编译路径(backend + frontend)直接用这些类型,不再需要 `as any` / `Record<string, unknown>`。
 */

// ---------- ActionType enum ----------
// 画布 target 节点支持所有"路由到"类型的 actionType
//
// ⚠️ 顺序敏感：必须与 packages/ui/.../schemas/targetSchema.ts 中的
// ACTION_TYPES (即 uiSchema enumNames) 保持一致。RJSF 用 schema.enum[i]
// 配 enumNames[i] 来生成下拉选项，顺序错位会导致"标签与值不匹配"。
const ActionTypeSchema = z.enum([
  'route_to_group',
  'route_to_instance',
  'route_to_access_model',
  'route_to_virtual_model', // 旧名，deprecated — 等价于 route_to_access_model
])

// ---------- 节点 data schemas ----------
//
// .passthrough() 让 Zod 保留未知字段 —— build-flow 会在 data 中附加
// routeId / condIndex / vmId / targetType / ruleName 等内部字段用于画布 UX,
// 这些字段不进 user-facing schema,但不能被静默丢弃(否则 build-flow 端会丢引用)。
// 这些 schema 同时用于:
//   1. Phase 1A: compile-time 类型推导 (z.infer → 强类型)
//   2. Phase 1A: runtime 校验 reject/fallback/intent/capability 叶子节点的必填项
//   3. Phase 1B: runtime 校验 build-flow 构造的 node.data(防御后端脏数据)

export const VmNodeDataSchema = z
  .object({
    label: z.string().default('接入模型'),
    modelName: z.string().optional(),
  })
  .passthrough()

export const ConditionNodeDataSchema = z
  .object({
    label: z.string().default('条件'),
    field: z.string().optional(),
    operator: z.string().optional(),
    value: z.string().optional(),
  })
  .passthrough()

export const TargetNodeDataSchema = z
  .object({
    label: z.string().default('目标'),
    actionType: ActionTypeSchema.optional(),
    targetId: z.string().optional(),
    targetName: z.string().optional(),
  })
  .passthrough()

/**
 * IntentNodeParameterSchema — 画布参数（不含路由）
 *
 * categories: 分类列表，驱动画布 handle 数量（每个分类一个 handle-{category}）
 * classifier: 分类器配置（可选，配置后使用小模型分类）
 *
 * 路由由画布 edges 定义：handle-{category} → target 节点。
 * compile-flow 从 edges 推导 targetGroupIds（运行时格式）。
 */
const IntentNodeParameterSchema = z
  .object({
    categories: z.array(z.string()).optional(),
    classifier: IntentClassifierConfigSchema.partial().optional(),
  })
  .optional()

export const IntentNodeDataSchema = z
  .object({
    label: z.string().default('意图路由'),
    intentConfig: IntentNodeParameterSchema,
  })
  .passthrough()

/**
 * CapabilityNodeParameterSchema — 画布参数（不含路由）
 *
 * capabilities: 能力列表，驱动画布 handle 数量（每个能力一个 handle-{capability}）
 *
 * 路由由画布 edges 定义：handle-{capability} → target 节点。
 * compile-flow 从 edges 推导 capabilityMap（运行时格式）。
 */
const CapabilityNodeParameterSchema = z
  .object({
    capabilities: z.array(z.string()).optional(),
  })
  .optional()

export const CapabilityNodeDataSchema = z
  .object({
    label: z.string().default('能力路由'),
    capabilityConfig: CapabilityNodeParameterSchema,
  })
  .passthrough()

export const StrategyNodeDataSchema = z
  .object({
    label: z.string().default('策略节点'),
    reason: z.string().optional(),
    strategyType: z.literal('reject'),
  })
  .passthrough()

/**
 * FallbackNodeData —— 「主备链」节点（双重 source handles）
 *
 *  - handle-primary: 主出口（必填）
 *  - handle-backup:  备出口（必填）
 *  - 任一出口可以是 target / intent / capability / reject（不能再是 fallback）
 */
export const FallbackNodeDataSchema = z
  .object({
    label: z.string().default('降级链'),
    description: z.string().optional(),
  })
  .passthrough()

// ---------- 类型导出 (z.infer) ----------
export type VmNodeData = z.infer<typeof VmNodeDataSchema>
export type ConditionNodeData = z.infer<typeof ConditionNodeDataSchema>
export type TargetNodeData = z.infer<typeof TargetNodeDataSchema>
export type IntentNodeData = z.infer<typeof IntentNodeDataSchema>
export type CapabilityNodeData = z.infer<typeof CapabilityNodeDataSchema>
export type StrategyNodeData = z.infer<typeof StrategyNodeDataSchema>
export type FallbackNodeData = z.infer<typeof FallbackNodeDataSchema>

// ---------- Node type literal ----------
export type NodeType = keyof NodeDataByType

// ---------- NodeDataByType registry ----------
// 把"节点类型字符串 → data 形状"做强类型映射
// React Flow 的 Node<T> 配合这个 registry,可以做到:
//   const node: Node<'intent'>  →  node.data 自动推断为 IntentNodeData
export interface NodeDataByType {
  modelTrigger: VmNodeData
  condition: ConditionNodeData
  target: TargetNodeData
  intent: IntentNodeData
  capability: CapabilityNodeData
  reject: StrategyNodeData
  fallback: FallbackNodeData
}

// ---------- Schemas 集合(供运行时校验) ----------
export const NodeDataSchemas = {
  modelTrigger: VmNodeDataSchema,
  condition: ConditionNodeDataSchema,
  target: TargetNodeDataSchema,
  intent: IntentNodeDataSchema,
  capability: CapabilityNodeDataSchema,
  reject: StrategyNodeDataSchema,
  fallback: FallbackNodeDataSchema,
} as const

// ---------- 校验工具函数 ----------

/**
 * 严格校验 —— 编译路径只用此版本,canvas 编辑用 parseNodeData(带 default)
 * 返回 typed data,内部字段(由 .passthrough 保留)在 strict 模式下被丢弃。
 */
export function parseNodeData<T extends NodeType>(
  type: T,
  data: unknown,
): NodeDataByType[T] | null {
  const schema = NodeDataSchemas[type] as z.ZodType<NodeDataByType[T]>
  const result = schema.safeParse(data)
  return result.success ? result.data : null
}

/**
 * build-flow 用 —— 校验 canvas node.data 是否符合 schema(允许 passthrough 内部字段),
 * 返回 boolean 不剥字段。供后端脏数据防御用。
 */
export function isValidNodeData<T extends NodeType>(type: T, data: unknown): boolean {
  return NodeDataSchemas[type].safeParse(data).success
}
