import { pgTable, varchar, boolean, timestamp, jsonb, uuid, text, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { providers } from '@/features/providers/db';

/**
 * 模型组 (Model Group)
 *
 * 模型组是对相同能力模型的抽象,可以包含来自不同供应商的相同模型。
 * 例如:"gpt-4" 模型组可以包含 OpenAI 的 gpt-4、Azure 的 gpt-4、Groq 的 gpt-4 等
 */

// 路由策略类型
export type RoutingStrategy = 'round_robin' | 'weighted' | 'least_latency' | 'priority' | 'cost_optimized' | 'smart';

// 模型能力配置
export interface ModelCapabilities {
  // 基本能力
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  jsonMode: boolean;

  // 参数限制
  maxTokens: number;
  contextWindow: number;

  // 特殊能力
  reasoning?: boolean;
  codeInterpreter?: boolean;
  webSearch?: boolean;

  // 其他自定义能力
  [key: string]: unknown;
}

// 模型组路由配置
export interface ModelGroupRoutingConfig {
  strategy: RoutingStrategy;
  fallbackEnabled: boolean;

  // 策略参数
  params?: {
    // 权重策略: { modelInstanceId: weight }
    weights?: Record<string, number>;

    // 成本优化策略
    costThreshold?: number; // 最大成本阈值

    // 延迟优化策略
    latencyThreshold?: number; // 最大延迟阈值(ms)

    // 智能路由策略
    preferProvider?: string[]; // 优先供应商列表

    // 其他参数
    [key: string]: unknown;
  };
}

export const modelGroups = pgTable('model_groups', {
  id: uuid('id').primaryKey().defaultRandom(),

  // 模型组标识 (唯一的模型名称,如 "gpt-4", "claude-3-opus")
  name: varchar('name', { length: 255 }).notNull().unique(),

  // 别名列表 (如 ["gpt4", "openai-gpt-4"])
  aliases: jsonb('aliases').$type<string[]>().default([]),

  // 显示名称
  displayName: varchar('display_name', { length: 255 }).notNull(),

  // 描述
  description: text('description'),

  // 模型类别标签 (如 "chat", "embedding", "image")
  category: varchar('category', { length: 50 }).default('chat').notNull(),

  // 模型能力配置
  capabilities: jsonb('capabilities').$type<ModelCapabilities>().notNull(),

  // 路由配置
  routingConfig: jsonb('routing_config').$type<ModelGroupRoutingConfig>().notNull(),

  // 支持的协议类型
  supportedProtocols: jsonb('supported_protocols').$type<string[]>().default(['openai']),

  // 状态
  enabled: boolean('enabled').default(true).notNull(),

  // 元数据
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ModelGroup = typeof modelGroups.$inferSelect;
export type NewModelGroup = typeof modelGroups.$inferInsert;

/**
 * 模型实例 (Model Instance)
 *
 * 模型实例是模型组在特定供应商上的具体实现。
 * 例如:模型组 "gpt-4" 可以有一个实例指向 OpenAI 的 "gpt-4-turbo"
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

  // 实例名称 (用于显示,如 "OpenAI GPT-4")
  name: varchar('name', { length: 255 }).notNull(),

  // 实际的模型名称 (供应商 API 使用的名称,如 "gpt-4-turbo-preview")
  actualModelName: varchar('actual_model_name', { length: 255 }).notNull(),

  // 实例描述
  description: text('description'),

  // 实例特定配置
  config: jsonb('config').$type<InstanceConfig>(),

  // 路由权重 (用于 weighted 策略)
  weight: integer('weight').default(100).notNull(),

  // 路由优先级 (用于 priority 策略,数字越小优先级越高)
  priority: integer('priority').default(0).notNull(),

  // 成本权重 (用于 cost_optimized 策略,每 1K tokens 的成本,单位:美元)
  costPer1kTokens: jsonb('cost_per_1k_tokens').$type<{
    input: number;
    output: number;
  }>(),

  // 健康检查端点 (可选,覆盖 provider 默认)
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
