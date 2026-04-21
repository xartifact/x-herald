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
