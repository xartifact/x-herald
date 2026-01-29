import { pgTable, varchar, boolean, timestamp, jsonb, uuid, integer, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { modelGroups } from './model-groups';
import { providers } from './providers';

/**
 * 模型实例 (Model Instance)
 *
 * 模型实例是模型组在特定供应商上的具体实现。
 * 例如：模型组 "gpt-4" 可以有一个实例指向 OpenAI 的 "gpt-4-turbo"
 */

// 实例特定的配置
export interface InstanceConfig {
  // 该实例特有的参数映射
  // 例如: { temperature: { min: 0, max: 2, default: 1 } }
  parameterMapping?: Record<string, {
    min?: number;
    max?: number;
    default?: unknown;
    transform?: string; // 转换函数表达式
  }>;

  // 覆盖模型组的能力配置
  capabilityOverrides?: Partial<{
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    maxTokens: number;
    contextWindow: number;
  }>;

  // 自定义头
  customHeaders?: Record<string, string>;

  // 重试配置
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;
    retryableStatusCodes: number[];
  };

  // 超时配置
  timeoutConfig?: {
    connectTimeout: number;
    readTimeout: number;
  };
}

export const modelInstances = pgTable('model_instances', {
  id: uuid('id').primaryKey().defaultRandom(),

  // 关联的模型组
  groupId: uuid('group_id').notNull().references(() => modelGroups.id, { onDelete: 'cascade' }),

  // 关联的供应商
  providerId: uuid('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),

  // 实例名称 (用于显示，如 "OpenAI GPT-4")
  name: varchar('name', { length: 255 }).notNull(),

  // 实际的模型名称 (供应商 API 使用的名称，如 "gpt-4-turbo-preview")
  actualModelName: varchar('actual_model_name', { length: 255 }).notNull(),

  // 实例描述
  description: text('description'),

  // 实例特定配置
  config: jsonb('config').$type<InstanceConfig>(),

  // 路由权重 (用于 weighted 策略)
  weight: integer('weight').default(100).notNull(),

  // 路由优先级 (用于 priority 策略，数字越小优先级越高)
  priority: integer('priority').default(0).notNull(),

  // 成本权重 (用于 cost_optimized 策略，每 1K tokens 的成本，单位：美元)
  costPer1kTokens: jsonb('cost_per_1k_tokens').$type<{
    input: number;
    output: number;
  }>(),

  // 健康检查端点 (可选，覆盖 provider 默认)
  healthCheckUrl: varchar('health_check_url', { length: 512 }),

  // 状态
  enabled: boolean('enabled').default(true).notNull(),

  // 状态标记 (由健康检查更新)
  status: varchar('status', { length: 20 }).default('unknown'), // unknown, healthy, degraded, down

  // 最后检查时间
  lastCheckedAt: timestamp('last_checked_at'),

  // 元数据
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 定义关系
export const modelInstancesRelations = relations(modelInstances, ({ one }) => ({
  group: one(modelGroups, {
    fields: [modelInstances.groupId],
    references: [modelGroups.id],
  }),
  provider: one(providers, {
    fields: [modelInstances.providerId],
    references: [providers.id],
  }),
}));

export type ModelInstance = typeof modelInstances.$inferSelect;
export type NewModelInstance = typeof modelInstances.$inferInsert;
