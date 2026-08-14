import { z } from 'zod'

/**
 * 路由条件(单条)
 */
export const RouteConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'ne', 'in', 'starts_with', 'exists', 'gt', 'lt', 'gte', 'lte']),
  value: z.unknown().optional(),
})
export type RouteCondition = z.infer<typeof RouteConditionSchema>

/**
 * 意图分类器(LLM 分类,可选)
 */
export const IntentClassifierConfigSchema = z.object({
  providerId: z.string(),
  modelName: z.string(),
  categories: z.array(z.string()),
  historyWindow: z.number().int().min(1).max(100).default(10).optional(),
})
export type IntentClassifierConfig = z.infer<typeof IntentClassifierConfigSchema>

/**
 * 意图 action 配置
 *
 * 路由目标既可以是一个 groupId（targetGroupIds），也可以是任意 RouteAction
 * （targetActions，如 fallback chain / nested intent / reject）。
 * 后者由编译器在编译时把画布的 fallback 节点展开成完整 RouteAction 注入，
 * 解决了「分类器返回的 category 在画布里路由到降级链，编译后被静默丢弃」
 * 的历史 bug —— 修复前复杂任务 / 编码任务被一律当 default 处理。
 */
export const IntentActionConfigSchema: z.ZodType<IntentActionConfig> = z.lazy(() =>
  z.object({
    /** 意图名称 → 模型组 ID 映射（直连 target 节点的最常见形态） */
    targetGroupIds: z.record(z.string(), z.string()),
    /** 意图名称 → 任意 RouteAction 映射（fallback chain / nested intent 等） */
    targetActions: z.record(z.string(), RouteActionSchema).optional(),
    /** 未匹配意图时的兜底组 */
    defaultGroupId: z.string().optional(),
    /** 未匹配意图时的兜底 action（与 defaultGroupId 二选一，action 优先） */
    defaultAction: RouteActionSchema.optional(),
    /** 分类器配置(可选,配置后使用小模型分类) */
    classifier: IntentClassifierConfigSchema.optional(),
  }),
)
export type IntentActionConfig = {
  targetGroupIds: Record<string, string>
  targetActions?: Record<string, RouteAction>
  defaultGroupId?: string
  defaultAction?: RouteAction
  classifier?: IntentClassifierConfig
}

/**
 * 意图路由决策的依据（供 routing-trace 展示"为什么命中该意图"）。
 *
 * 由 intent-handler 在分类后写入 RouteResult，经 routing-trace-recorder
 * 落到 routeChain 的 chain step 上。分类器原始请求/响应体可能较大，
 * 只在 detail 查询层按需返回（列表接口不携带）。
 */
export interface IntentTraceInfo {
  /** 分类器判定的意图名（如 "编码任务"） */
  intentName: string
  /** 判定来源：classifier / model_name / capability / fallback / default / agent_directive */
  intentSource: string
  /** 分类器 JSON 里返回的 confidence（0~1），解析失败为 0 */
  confidence?: number
  /** 用户消息（去除 system-reminder / tool 噪声后的纯净文本） */
  userMessage?: string
  /** 用户消息中检测到的能力（vision / audio / tool_use 等） */
  capabilities?: string[]
  /** 分类器输出原文（未标准化大小写的 category） */
  classifierCategory?: string | null
  /** 分类器返回的原始响应文本（rawText，content 或 reasoning_content） */
  classifierRawResponse?: string | null
  /** 分类器使用的模型名 */
  classifierModelName?: string | null
  /** 分类器调用耗时 ms */
  classifierLatencyMs?: number
  /** 分类器 HTTP 状态码 */
  classifierStatusCode?: number | null
}

/**
 * 能力 action 配置
 */
export const CapabilityActionConfigSchema = z.object({
  /** 能力名 → 模型组 ID 映射 */
  capabilityMap: z.record(z.string(), z.string()),
  /** 未识别能力时的兜底组 */
  defaultGroupId: z.string().optional(),
})
export type CapabilityActionConfig = z.infer<typeof CapabilityActionConfigSchema>

/**
 * Route action 类型枚举
 */
export const RouteActionTypeSchema = z.enum([
  'route_to_virtual_model',
  'route_to_group',
  'route_to_instance',
  'reject',
  'fallback',
  'intent',
  'capability',
])
export type RouteActionType = z.infer<typeof RouteActionTypeSchema>

/**
 * Route action 主体
 *
 * `fallback` action 是「主备链」语义：
 *   - primary: 主出口 RouteAction
 *   - backup:  备出口 RouteAction
 *   - 两个出口都不能再是 `fallback`（避免无限链 + 编译爆炸）
 *   - 运行时顺序尝试 primary → backup，主失败全部降级到备
 *
 * 历史说明（v0 废弃）：
 *   旧 `fallback` action 是「terminal reject」语义，等同于 `reject`。
 *   已在跨 provider 降级需求中重构为「主备链」。
 *   旧数据迁移：`migrate-canvas-state.ts` 会将 legacy `fallback` 转 `reject`。
 *
 * 递归类型用 z.lazy() 实现；TS 类型用 interface + RouteAction 别名。
 */
export type RouteAction = {
  type: RouteActionType
  targetId?: string
  reason?: string
  intentConfig?: IntentActionConfig
  capabilityConfig?: CapabilityActionConfig
  primary?: RouteAction
  backup?: RouteAction
}

export const RouteActionSchema: z.ZodType<RouteAction> = z.lazy(() =>
  z
    .object({
      type: RouteActionTypeSchema,
      targetId: z.string().optional(),
      reason: z.string().optional(),
      intentConfig: IntentActionConfigSchema.optional(),
      capabilityConfig: CapabilityActionConfigSchema.optional(),
      primary: z.lazy(() => RouteActionSchema).optional(),
      backup: z.lazy(() => RouteActionSchema).optional(),
    })
    .refine(
      (a) => {
        if (a.type !== 'fallback') return true
        if (!a.primary || !a.backup) return false
        if (a.primary.type === 'fallback' || a.backup.type === 'fallback') return false
        return true
      },
      {
        message:
          'fallback action requires {primary, backup} of terminal types (not fallback itself)',
      },
    ),
)
