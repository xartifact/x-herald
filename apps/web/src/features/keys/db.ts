import { pgTable, varchar, boolean, integer, timestamp, uuid, text, bigint } from 'drizzle-orm/pg-core';

export const virtualKeys = pgTable('virtual_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  allowedModels: text('allowed_models').array(),
  rateLimitRpm: integer('rate_limit_rpm'),
  rateLimitRpd: integer('rate_limit_rpd'),
  tokenLimitDaily: bigint('token_limit_daily', { mode: 'bigint' }),
  enabled: boolean('enabled').default(true).notNull(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type VirtualKey = typeof virtualKeys.$inferSelect;
export type NewVirtualKey = typeof virtualKeys.$inferInsert;

// Request Logs (从 logs feature 引用)
export { requestLogs } from '@x-llm-gateway/engine';
