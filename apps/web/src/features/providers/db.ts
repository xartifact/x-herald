import { pgTable, varchar, boolean, timestamp, text, uuid, jsonb } from 'drizzle-orm/pg-core';

// 协议配置接口
export interface ProtocolConfig {
  baseUrl: string;
  enabled: boolean;
}

// 思考模式映射配置
export interface ThinkingMappingConfig {
  enabled: boolean;
  mappings: Record<string, string>;
}

// 合成 thinking 块策略
// strip: 移除 thinking 参数，降级为非 thinking 模式（默认，安全）
// inject: 注入伪造 thinking 块，适用于无 signature 校验的 Provider
export type SyntheticThinkingStrategy = 'strip' | 'inject';

export interface ProtocolExtendedConfig extends ProtocolConfig {
  thinkingMapping?: ThinkingMappingConfig;
  syntheticThinking?: SyntheticThinkingStrategy;
}

// 支持的协议类型
export type ProtocolType = 'openai' | 'anthropic' | 'gemini' | 'custom';

// 协议配置映射
export type ProtocolsConfig = Partial<Record<ProtocolType, ProtocolExtendedConfig>>;

export const providers = pgTable('providers', {
  id: uuid('id').primaryKey().defaultRandom(),

  // 基本信息
  name: varchar('name', { length: 255 }).notNull(),

  // API 认证 - 所有协议共享
  apiKey: text('api_key'),

  // 协议配置 - 每个协议有独立的 baseUrl 和启用状态
  protocols: jsonb('protocols').$type<ProtocolsConfig>().notNull(),

  // 供应商全局开关
  enabled: boolean('enabled').default(true).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;
