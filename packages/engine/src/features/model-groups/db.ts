import { relations } from 'drizzle-orm';
import { pgTable, varchar, boolean, timestamp, jsonb, uuid, text, integer, primaryKey } from 'drizzle-orm/pg-core';

import { providers } from '../../features/providers/db';

/**
 * 模型组 (Model Group)
 *
 * 模型组是对相同能力模型的抽象,可以包含来自不同供应商的相同模型。
 * 例如:"gpt-4" 模型组可以包含 OpenAI 的 gpt-4、Azure 的 gpt-4、Groq 的 gpt-4 等
 */

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


export interface RoutingConfig {
  strategy: 'round_robin' | 'weighted' | 'least_response_time' | 'priority' | 'cost_optimized' | 'smart';
  fallbackEnabled: boolean;
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

  // 支持的协议类型
  supportedProtocols: jsonb('supported_protocols').$type<string[]>().default(['openai']),

  // 状态
  enabled: boolean('enabled').default(true).notNull(),

  // 路由配置
  routingConfig: jsonb('routing_config').$type<RoutingConfig>(),

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

  // 是否支持 thinking/extended thinking（Claude 3.7+/4+）
  supportsThinking?: boolean;

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

  // 供应商特定参数转换规则
  parameterTransforms?: Array<{
    // 匹配条件
    when?: {
      paramName: string;
      operator: 'eq' | 'ne' | 'exists' | 'not_exists';
      value?: unknown;
    };
    // 转换操作
    action: {
      type: 'add' | 'remove' | 'rename' | 'transform';
      targetParam: string;
      value?: unknown;
      // 简单表达式支持，如: "${reasoning.enabled} ? true : false"
      expression?: string;
    };
  }>;

  // Schema处理配置
  schemaConfig?: {
    cleanEnabled: boolean;
    preserveFields?: string[];  // 保留的字段（覆盖默认清理）
    additionalBannedFields?: string[];  // 额外清理的字段
  };
}

export const modelInstances = pgTable('model_instances', {
  id: uuid('id').primaryKey().defaultRandom(),

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

// 模型组-实例多对多关联表
export const modelGroupMemberships = pgTable('model_group_memberships', {
  groupId: uuid('group_id').notNull().references(() => modelGroups.id, { onDelete: 'cascade' }),
  instanceId: uuid('instance_id').notNull().references(() => modelInstances.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.groupId, table.instanceId] }),
}));

export type ModelGroupMembership = typeof modelGroupMemberships.$inferSelect;
export type NewModelGroupMembership = typeof modelGroupMemberships.$inferInsert;

// 定义关系
export const modelInstancesRelations = relations(modelInstances, ({ one, many }) => ({
  memberships: many(modelGroupMemberships),
  provider: one(providers, {
    fields: [modelInstances.providerId],
    references: [providers.id],
  }),
}));

export const modelGroupMembershipsRelations = relations(modelGroupMemberships, ({ one }) => ({
  group: one(modelGroups, {
    fields: [modelGroupMemberships.groupId],
    references: [modelGroups.id],
  }),
  instance: one(modelInstances, {
    fields: [modelGroupMemberships.instanceId],
    references: [modelInstances.id],
  }),
}));

export type ModelInstance = typeof modelInstances.$inferSelect;
export type NewModelInstance = typeof modelInstances.$inferInsert;

/**
 * 接入模型 (Access Model)
 *
 * 接入模型是对外暴露的模型名称，通过规则引擎路由到模型组或模型实例。
 */
export const accessModels = pgTable('access_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  description: text('description'),
  enabled: boolean('enabled').default(true).notNull(),
  capabilities: jsonb('capabilities').$type<ModelCapabilities>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type AccessModel = typeof accessModels.$inferSelect;
export type NewAccessModel = typeof accessModels.$inferInsert;

/** @deprecated Use `accessModels` */
export const virtualModels = accessModels;
/** @deprecated Use `AccessModel` */
export type VirtualModel = AccessModel;
/** @deprecated Use `NewAccessModel` */
export type NewVirtualModel = NewAccessModel;

/**
 * 路由规则 (Model Route)
 *
 * 定义请求如何通过条件匹配路由到目标。
 * 支持 React Flow 可视化编辑。
 */

// 路由条件
export interface RouteCondition {
  field: string;
  operator: 'eq' | 'ne' | 'in' | 'starts_with' | 'exists' | 'gt' | 'lt' | 'gte' | 'lte';
  value?: unknown;
}

// 路由动作
export interface RouteAction {
  type: 'route_to_virtual_model' | 'route_to_group' | 'route_to_instance' | 'reject' | 'fallback';
  targetId?: string;
  reason?: string;
}

// React Flow 序列化数据
export interface FlowData {
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
}

export const modelRoutes = pgTable('model_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  accessModelIds: text('access_model_ids').array().notNull().default([]),
  conditions: jsonb('conditions').$type<RouteCondition[]>().default([]),
  action: jsonb('action').$type<RouteAction>().notNull(),
  priority: integer('priority').default(0).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  flowData: jsonb('flow_data').$type<FlowData>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const modelRoutesRelations = relations(modelRoutes, ({ many }) => ({
  // Note: accessModelIds is a TEXT[] array - no FK relationship
  // Access model lookup is done at application layer
}));

export type ModelRoute = typeof modelRoutes.$inferSelect;
export type NewModelRoute = typeof modelRoutes.$inferInsert;
