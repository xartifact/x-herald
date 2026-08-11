import { z } from 'zod'

export const POTENTIAL_MODEL_ACTIONS = ['observe', 'route_to_access_model'] as const
export type PotentialModelAction = (typeof POTENTIAL_MODEL_ACTIONS)[number]

/**
 * 潜在模型 = 客户端请求过、但尚未接入的 model name。
 *
 * 两种 admin 操作：
 *  1. "Convert" → 创建新的 access_model，并把本行删掉（或保留观察）
 *  2. "Route to" → 把 action 改成 route_to_access_model 并指向已有 access_model
 *     此后所有该 model_name 的请求会被改写到目标 access_model，享受完整路由能力
 *     （route rules / model groups / failover / circuit breaker / rate limit / intent）。
 */

export const potentialModelActionSchema = z.enum(POTENTIAL_MODEL_ACTIONS)

export const potentialModelSchema = z.object({
  id: z.string().uuid(),
  modelName: z.string().min(1).max(255),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  requestCount: z.number().int().min(0),
  sampleVirtualKeyIds: z.array(z.string().uuid()),
  action: potentialModelActionSchema,
  targetAccessModelId: z.string().uuid().nullable(),
  enabled: z.boolean(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type PotentialModel = z.infer<typeof potentialModelSchema>

/** 列表查询参数 */
export const listPotentialModelsQuerySchema = z.object({
  action: potentialModelActionSchema.optional(),
  enabled: z.coerce.boolean().optional(),
  minCount: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})
export type ListPotentialModelsQuery = z.infer<typeof listPotentialModelsQuerySchema>

/** 更新（设置 route_to 目标 / 启用 / 备注） */
export const updatePotentialModelSchema = z
  .object({
    action: potentialModelActionSchema.optional(),
    targetAccessModelId: z.string().uuid().nullable().optional(),
    enabled: z.boolean().optional(),
    note: z.string().max(1000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.action === undefined ||
      v.action === 'observe' ||
      (v.action === 'route_to_access_model' && v.targetAccessModelId != null),
    {
      message: 'targetAccessModelId is required when action=route_to_access_model',
      path: ['targetAccessModelId'],
    },
  )

export type UpdatePotentialModelInput = z.infer<typeof updatePotentialModelSchema>

/** "Convert to Access Model" 操作 */
export const convertToAccessModelSchema = z.object({
  displayName: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  enabled: z.boolean().default(true),
  capabilities: z
    .object({
      streaming: z.boolean().default(true),
      functionCalling: z.boolean().default(true),
      vision: z.boolean().default(false),
      jsonMode: z.boolean().default(false),
      maxTokens: z.number().int().min(1).default(4096),
      contextWindow: z.number().int().min(1).default(128000),
    })
    .optional(),
  /** 转换后是否删除潜在模型行（默认 true：转换后无意义） */
  deleteAfterConvert: z.boolean().default(true),
})
export type ConvertToAccessModelInput = z.infer<typeof convertToAccessModelSchema>
