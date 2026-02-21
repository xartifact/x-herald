import { pgTable, varchar, boolean, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';

/**
 * 网关配置表
 * 存储运行时配置，支持动态更新
 */
export const gatewayConfigs = pgTable('gateway_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: jsonb('value').notNull(),
  description: varchar('description', { length: 255 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type GatewayConfig = typeof gatewayConfigs.$inferSelect;
export type NewGatewayConfig = typeof gatewayConfigs.$inferInsert;

/**
 * 配置键名常量
 */
export const CONFIG_KEYS = {
  MODEL_MAPPING_ENABLED: 'model_mapping_enabled',
  MODEL_MAPPING_DEFAULT_GROUP: 'model_mapping_default_group',
} as const;

/**
 * 模型映射配置类型
 */
export interface ModelMappingConfig {
  enabled: boolean;
  defaultModelGroup: string;
}
