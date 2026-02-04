import { pgTable, varchar, integer, timestamp, text, uuid, jsonb, index } from 'drizzle-orm/pg-core';
import { virtualKeys } from '@/features/keys/db';
import { providers } from '@/features/providers/db';

export const requestLogs = pgTable('request_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  virtualKeyId: uuid('virtual_key_id').references(() => virtualKeys.id),
  virtualKeyName: varchar('virtual_key_name', { length: 255 }),
  modelName: varchar('model_name', { length: 255 }).notNull(),
  providerId: uuid('provider_id').references(() => providers.id),
  providerName: varchar('provider_name', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().$type<'success' | 'failure'>(),
  statusCode: integer('status_code'),
  latencyMs: integer('latency_ms').notNull(),
  inputTokens: integer('input_tokens').default(0).notNull(),
  outputTokens: integer('output_tokens').default(0).notNull(),
  totalTokens: integer('total_tokens').default(0).notNull(),
  requestHeaders: jsonb('request_headers'),
  requestBody: jsonb('request_body'),
  transformedRequestBody: jsonb('transformed_request_body'),
  responseHeaders: jsonb('response_headers'),
  responseBody: jsonb('response_body'),
  errorMessage: text('error_message'),
  errorType: varchar('error_type', { length: 50 }),
  clientIp: varchar('client_ip', { length: 45 }),
  userAgent: text('user_agent'),
  requestPath: varchar('request_path', { length: 255 }),
  requestMethod: varchar('request_method', { length: 10 }),
  streaming: varchar('streaming', { length: 10 }).default('false').notNull(),
  incomingProtocol: varchar('incoming_protocol', { length: 50 }),
  targetProtocol: varchar('target_protocol', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // 添加常用查询索引
  virtualKeyIdIdx: index('idx_request_logs_virtual_key_id').on(table.virtualKeyId),
  modelNameIdx: index('idx_request_logs_model_name').on(table.modelName),
  providerIdIdx: index('idx_request_logs_provider_id').on(table.providerId),
  statusIdx: index('idx_request_logs_status').on(table.status),
  createdAtIdx: index('idx_request_logs_created_at').on(table.createdAt),
  streamingIdx: index('idx_request_logs_streaming').on(table.streaming),
}));

export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;
