import { pgTable, varchar, boolean, timestamp, jsonb, uuid, text, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * 模型组 (Model Group)
 *
 * 模型组是对相同能力模型的抽象，可以包含来自不同供应商的相同模型。
 * 例如："gpt-4" 模型组可以包含 OpenAI 的 gpt-4、Azure 的 gpt-4、Groq 的 gpt-4 等
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

  // 模型组标识 (唯一的模型名称，如 "gpt-4", "claude-3-opus")
  name: varchar('name', { length: 255 }).notNull().unique(),

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
