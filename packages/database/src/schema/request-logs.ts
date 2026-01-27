import { pgTable, varchar, integer, timestamp, text, uuid, jsonb } from 'drizzle-orm/pg-core';
import { virtualKeys } from './virtual-keys';
import { providers } from './providers';

export const requestLogs = pgTable('request_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  virtualKeyId: uuid('virtual_key_id').references(() => virtualKeys.id),
  modelName: varchar('model_name', { length: 255 }).notNull(),
  providerId: uuid('provider_id').references(() => providers.id),
  status: varchar('status', { length: 20 }).notNull().$type<'success' | 'failure'>(),
  latencyMs: integer('latency_ms').notNull(),
  inputTokens: integer('input_tokens').default(0).notNull(),
  outputTokens: integer('output_tokens').default(0).notNull(),
  totalTokens: integer('total_tokens').default(0).notNull(),
  errorMessage: text('error_message'),
  requestBody: jsonb('request_body'),
  responseBody: jsonb('response_body'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;
