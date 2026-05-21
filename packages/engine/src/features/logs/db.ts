import { pgTable, varchar, integer, timestamp, text, uuid, jsonb, index, boolean, doublePrecision } from 'drizzle-orm/pg-core';

export type FailoverReason = 'http_429' | 'http_5xx' | 'ttfb_timeout' | 'network_error';

/**
 * 日志元数据结构
 * 用于存储灵活的业务标记和自定义元数据
 */
export interface LogMetadata {
  // 消息序列信息
  messageSequence?: {
    totalCount: number;  // 消息总数
    roles: Array<{
      role: 'user' | 'assistant' | 'system' | 'tool';
      index: number;              // 在消息数组中的位置（从1开始）
      contentType?: string[];     // ['text', 'image']
      toolCallCount?: number;     // assistant 消息包含的工具调用数
      toolName?: string;          // tool 消息关联的工具名称
      toolCallId?: string;        // tool 消息关联的调用 ID
      length?: number;            // 内容长度（字符数）
    }>;
  };

  // 工具调用追踪（增强）
  toolCalls?: {
    pattern?: 'sequential' | 'parallel' | 'single';  // 调用模式
    tools?: string[];                                 // 工具名称列表
    details?: Array<{                                 // 详细信息
      name: string;
      arguments?: unknown;
      result?: unknown;          // 工具执行结果（从 tool role 消息提取）
      callId?: string;           // 调用 ID（如 call_abc123）
      source?: 'request' | 'response';  // 来源
      messageIndex?: number;     // 在消息序列中的位置
    }>;
  };

  // 对话上下文（增强）
  conversation?: {
    messageId?: string;
    parentMessageId?: string;
    turnNumber?: number;
    role?: string;
    roleSwitches?: number;           // 角色切换次数
    hasToolInteraction?: boolean;    // 是否包含工具交互
  };

  // 模型映射信息
  modelMapping?: {
    originalModel?: string;
    mappingType?: 'virtual' | 'exact' | 'alias' | 'fallback' | null;
    isMapped?: boolean;
  };

  // 内容特征
  content?: {
    types?: string[];                                 // text, image, audio, video
    hasFunctionCalling?: boolean;
    responseFormat?: string;
    language?: string;
    toolNames?: string[];                             // 工具调用名称列表
  };

  // 性能和成本
  performance?: {
    cacheHit?: boolean;
    estimatedCostUsd?: number;
    responseTimeTier?: 'fast' | 'normal' | 'slow';
    ttfbMs?: number;                                  // Time to first byte
    usageEstimated?: boolean;                         // 标记 token 是否为估算
    // 链路分段响应时间（毫秒）
    gatewayOverheadMs?: number;                       // 网关预处理耗时（协议检测、路由、转换）
    providerTtfbMs?: number;                          // Provider 首字节响应时间（网络 + Provider 思考）
    streamDurationMs?: number;                        // 流式传输持续时间
    ttfbToFirstThinkingMs?: number;                   // HTTP TTFB → 第一个 thinking token
    ttfbToFirstTextMs?: number;                       // HTTP TTFB → 第一个 text token（TTFT）
    thinkingDurationMs?: number;                      // 实际思考时长（首 thinking → 首 text token）
  };

  // 请求特征
  request?: {
    type?: string;
    useCase?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    thinkingMode?: boolean;           // 是否开启思考模式
  };

  // 路由追踪
  routing?: {
    requestedModel: string;        // 客户端原始请求的模型名
    matchedRuleId?: string;        // 命中的路由规则 ID
    matchedRuleName?: string;      // 命中的路由规则名称
    matchedRulePriority?: number;  // 命中规则的优先级
    modelGroupId?: string;         // 路由到的模型组 ID
    modelGroupName?: string;       // 模型组名称
    instanceId?: string;           // 选中的实例 ID
    actualModelName?: string;      // 实际发送给 Provider 的模型名
    strategy?: string;             // 决策策略
    responseModelName?: string;    // Provider 响应中的实际模型名
  };

  // 错误和重试
  error?: {
    retryCount?: number;
    retryReason?: string;
    category?: string;
    recoverable?: boolean;
  };

  // 业务标记
  business?: {
    userId?: string;
    organizationId?: string;
    tags?: string[];
    customFields?: Record<string, unknown>;
  };
}

/**
 * 流进度信息
 */
export interface StreamProgress {
  chunksProcessed: number;
  bytesReceived: number;
  lastChunkAt: number;
}

/**
 * 流内容信息
 */
export interface StreamContent {
  thinkingBlocks: string[];
  contentChunks: string[];
  allChunks: unknown[];
}
import { virtualKeys } from '../keys/db';
import { providers } from '../providers/db';

export const requestLogs = pgTable('request_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Failover 链路追踪：同一次客户端请求的所有候选尝试共享同一个 requestGroupId
  requestGroupId: uuid('request_group_id').notNull(),
  candidateIndex: integer('candidate_index').default(0).notNull(),
  failoverReason: varchar('failover_reason', { length: 20 }).$type<FailoverReason>(),
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
  metadata: jsonb('metadata').$type<LogMetadata>(),
  toolCallsCount: integer('tool_calls_count').default(0),
  retryCount: integer('retry_count').default(0).notNull(),
  conversationId: uuid('conversation_id'),
  streamStatus: varchar('stream_status', { length: 20 })
    .$type<'pending' | 'streaming' | 'completed' | 'failed' | 'aborted'>()
    .default('pending'),
  streamProgress: jsonb('stream_progress').$type<StreamProgress>(),
  streamContent: jsonb('stream_content').$type<StreamContent>(),
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

/**
 * Provider 尝试记录表（每次 Failover 候选各一条）
 * 存储 Provider 视角的请求/响应数据，与 requestLogs 通过 requestGroupId 关联
 */
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
  failoverReason: varchar('failover_reason', { length: 20 }).$type<FailoverReason>(),
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

export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;
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
