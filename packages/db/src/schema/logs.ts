import { pgTable, varchar, integer, timestamp, text, uuid, jsonb, index, boolean, doublePrecision } from 'drizzle-orm/pg-core';

import { virtualKeys } from './keys';
import { providers } from './providers';

export const requestLogs = pgTable('request_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestGroupId: uuid('request_group_id').notNull(),
  candidateIndex: integer('candidate_index').default(0).notNull(),
  failoverReason: varchar('failover_reason', { length: 20 }),
  virtualKeyId: uuid('virtual_key_id').references(() => virtualKeys.id),
  virtualKeyName: varchar('virtual_key_name', { length: 255 }),
  modelName: varchar('model_name', { length: 255 }).notNull(),
  originalModelName: varchar('original_model_name', { length: 255 }),
  // 最终服务此请求的 Provider（便于快速查询）
  providerId: uuid('provider_id').references(() => providers.id),
  providerName: varchar('provider_name', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().$type<'success' | 'failure' | 'pending'>(),
  statusCode: integer('status_code'),
  responseTimeMs: integer('response_time_ms').notNull(),
  inputTokens: integer('input_tokens').default(0).notNull(),
  outputTokens: integer('output_tokens').default(0).notNull(),
  totalTokens: integer('total_tokens').default(0).notNull(),
  // 客户端视角的请求/响应（不含 Provider 内部数据，Provider 数据存 requestAttempts）
  requestHeaders: jsonb('request_headers'),
  requestBody: jsonb('request_body'),
  clientResponseHeaders: jsonb('client_response_headers'),
  responseBody: jsonb('response_body'),
  errorMessage: text('error_message'),
  errorType: varchar('error_type', { length: 50 }),
  clientIp: varchar('client_ip', { length: 45 }),
  userAgent: text('user_agent'),
  clientType: varchar('client_type', { length: 100 }),
  requestPath: varchar('request_path', { length: 255 }),
  requestMethod: varchar('request_method', { length: 10 }),
  streaming: varchar('streaming', { length: 10 }).default('false').notNull(),
  incomingProtocol: varchar('incoming_protocol', { length: 50 }),
  targetProtocol: varchar('target_protocol', { length: 50 }),
  metadata: jsonb('metadata'),
  toolCallsCount: integer('tool_calls_count').default(0),
  retryCount: integer('retry_count').default(0).notNull(),
  conversationId: uuid('conversation_id'),
  streamStatus: varchar('stream_status', { length: 20 })
    .$type<'pending' | 'streaming' | 'completed' | 'failed' | 'aborted'>()
    .default('pending'),
  streamProgress: jsonb('stream_progress'),
  streamContent: jsonb('stream_content'),
  streamStartedAt: timestamp('stream_started_at').$defaultFn(() => new Date()),
  streamCompletedAt: timestamp('stream_completed_at').$defaultFn(() => new Date()),
  lastUpdatedAt: timestamp('last_updated_at').$defaultFn(() => new Date()),
  isComplete: boolean('is_complete').default(false).notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  virtualKeyIdIdx: index('idx_request_logs_virtual_key_id').on(table.virtualKeyId),
  modelNameIdx: index('idx_request_logs_model_name').on(table.modelName),
  originalModelNameIdx: index('idx_request_logs_original_model_name').on(table.originalModelName),
  providerIdIdx: index('idx_request_logs_provider_id').on(table.providerId),
  statusIdx: index('idx_request_logs_status').on(table.status),
  createdAtIdx: index('idx_request_logs_created_at').on(table.createdAt),
  streamingIdx: index('idx_request_logs_streaming').on(table.streaming),
  toolCallsCountIdx: index('idx_request_logs_tool_calls_count').on(table.toolCallsCount),
  conversationIdIdx: index('idx_request_logs_conversation_id').on(table.conversationId),
  statusCreatedAtIdx: index('idx_request_logs_status_created_at').on(table.status, table.createdAt),
  streamStatusIdx: index('idx_request_logs_stream_status').on(table.streamStatus),
  isCompleteIdx: index('idx_request_logs_is_complete').on(table.isComplete),
  streamStatusIsCompleteIdx: index('idx_stream_status_complete').on(table.streamStatus, table.isComplete),
  lastUpdatedAtIdx: index('idx_request_logs_last_updated_at').on(table.lastUpdatedAt),
  requestGroupIdIdx: index('idx_request_logs_request_group_id').on(table.requestGroupId),
}));

export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;

export const requestAttempts = pgTable('request_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestLogId: uuid('request_log_id').references(() => requestLogs.id).notNull(),
  requestGroupId: uuid('request_group_id').notNull(),
  candidateIndex: integer('candidate_index').default(0).notNull(),
  instanceId: uuid('instance_id'),
  providerId: uuid('provider_id').references(() => providers.id),
  providerName: varchar('provider_name', { length: 255 }),
  targetProtocol: varchar('target_protocol', { length: 50 }),
  status: varchar('status', { length: 20 }).$type<'success' | 'failure' | 'pending'>().default('pending').notNull(),
  statusCode: integer('status_code'),
  failoverReason: varchar('failover_reason', { length: 20 }),
  retryCount: integer('retry_count').default(0).notNull(),
  ttfbMs: integer('ttfb_ms'),
  durationMs: integer('duration_ms'),
  // Provider 视角的请求/响应体
  transformedRequestBody: jsonb('transformed_request_body'),
  providerRequestHeaders: jsonb('provider_request_headers'),
  providerResponseBody: jsonb('provider_response_body'),
  providerResponseHeaders: jsonb('provider_response_headers'),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  requestLogIdIdx: index('idx_request_attempts_log_id').on(table.requestLogId),
  requestGroupIdIdx: index('idx_request_attempts_group_id').on(table.requestGroupId),
  providerIdIdx: index('idx_request_attempts_provider_id').on(table.providerId),
  statusIdx: index('idx_request_attempts_status').on(table.status),
  candidateIndexIdx: index('idx_request_attempts_candidate_index').on(table.requestGroupId, table.candidateIndex),
}));

export type RequestAttempt = typeof requestAttempts.$inferSelect;
export type NewRequestAttempt = typeof requestAttempts.$inferInsert;

/**
 * 客户端请求的模型名称记录表
 * 用于收集所有客户端请求过的模型名称，名称唯一
 */
export const clientRequestedModels = pgTable('client_requested_models', {
  modelName: varchar('model_name', { length: 255 }).primaryKey(),
  firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  requestCount: integer('request_count').default(1).notNull(),
}, (table) => ({
  lastSeenAtIdx: index('idx_client_models_last_seen').on(table.lastSeenAt),
  requestCountIdx: index('idx_client_models_request_count').on(table.requestCount),
}));

export type ClientRequestedModel = typeof clientRequestedModels.$inferSelect;
export type NewClientRequestedModel = typeof clientRequestedModels.$inferInsert;

/**
 * 模型请求统计表
 * 用于跟踪每个模型的请求量和热度评分，支持基于时间的指数衰减算法
 */
export const modelRequestStats = pgTable('model_request_stats', {
  modelId: varchar('model_id', { length: 255 }).primaryKey(),
  requestCount: integer('request_count').default(0).notNull(),
  lastRequestAt: timestamp('last_request_at').defaultNow().notNull(),
  currentScore: doublePrecision('current_score').default(0).notNull(),
  lastScoredAt: timestamp('last_scored_at').defaultNow().notNull(),
}, (table) => ({
  lastRequestAtIdx: index('idx_model_stats_last_request').on(table.lastRequestAt),
  currentScoreIdx: index('idx_model_stats_current_score').on(table.currentScore),
}));

export type ModelRequestStat = typeof modelRequestStats.$inferSelect;
export type NewModelRequestStat = typeof modelRequestStats.$inferInsert;
