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

export interface ProtocolExtendedConfig extends ProtocolConfig {
  thinkingMapping?: ThinkingMappingConfig;
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
