import { pgTable, varchar, integer, timestamp, text, uuid, jsonb, index, boolean } from 'drizzle-orm/pg-core';

/**
 * 日志元数据结构
 * 用于存储灵活的业务标记和自定义元数据
 */
export interface LogMetadata {
  // 工具调用追踪
  toolCalls?: {
    pattern?: 'sequential' | 'parallel' | 'single';  // 调用模式
    tools?: string[];                                 // 工具名称列表
    details?: Array<{                                 // 详细信息
      name: string;
      arguments?: unknown;
      result?: unknown;
    }>;
  };

  // 对话上下文
  conversation?: {
    messageId?: string;
    parentMessageId?: string;
    turnNumber?: number;
    role?: string;
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
    latencyTier?: 'fast' | 'normal' | 'slow';
    ttfbMs?: number;                                  // Time to first byte
    usageEstimated?: boolean;                         // 标记 token 是否为估算
  };

  // 请求特征
  request?: {
    type?: string;
    useCase?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
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
  // 请求链路追踪
  requestBody: jsonb('request_body'),                         // 客户端原始请求
  standardRequestBody: jsonb('standard_request_body'),        // 标准格式请求
  transformedRequestBody: jsonb('transformed_request_body'),  // Provider 请求
  // 响应头链路追踪
  providerResponseHeaders: jsonb('provider_response_headers'), // Provider 响应头
  clientResponseHeaders: jsonb('client_response_headers'),     // 客户端响应头
  // 响应链路追踪
  providerResponseBody: jsonb('provider_response_body'),      // Provider 原始响应
  standardResponseBody: jsonb('standard_response_body'),      // 标准格式（可选）
  responseBody: jsonb('response_body'),                       // 客户端最终响应
  errorMessage: text('error_message'),
  errorType: varchar('error_type', { length: 50 }),
  clientIp: varchar('client_ip', { length: 45 }),
  userAgent: text('user_agent'),
  requestPath: varchar('request_path', { length: 255 }),
  requestMethod: varchar('request_method', { length: 10 }),
  streaming: varchar('streaming', { length: 10 }).default('false').notNull(),
  incomingProtocol: varchar('incoming_protocol', { length: 50 }),
  targetProtocol: varchar('target_protocol', { length: 50 }),
  // 新增字段：标记系统
  metadata: jsonb('metadata').$type<LogMetadata>(),              // 灵活的元数据标记
  toolCallsCount: integer('tool_calls_count').default(0),        // 工具调用计数
  conversationId: uuid('conversation_id'),                       // 对话追踪 ID
  
  // Phase 1 新增字段：流状态管理
  streamStatus: varchar('stream_status', { length: 20 })
    .$type<'pending' | 'streaming' | 'completed' | 'failed' | 'aborted'>()
    .default('pending'),
  
  // 流处理进度
  streamProgress: jsonb('stream_progress').$type<StreamProgress>(),
  
  // 完整的流内容
  streamContent: jsonb('stream_content').$type<StreamContent>(),
  
  // 时间戳
  streamStartedAt: timestamp('stream_started_at'),
  streamCompletedAt: timestamp('stream_completed_at'),
  lastUpdatedAt: timestamp('last_updated_at').defaultNow(),
  
  // 完成标记（用于查询优化）
  isComplete: boolean('is_complete').default(false).notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // 添加常用查询索引
  virtualKeyIdIdx: index('idx_request_logs_virtual_key_id').on(table.virtualKeyId),
  modelNameIdx: index('idx_request_logs_model_name').on(table.modelName),
  providerIdIdx: index('idx_request_logs_provider_id').on(table.providerId),
  statusIdx: index('idx_request_logs_status').on(table.status),
  createdAtIdx: index('idx_request_logs_created_at').on(table.createdAt),
  streamingIdx: index('idx_request_logs_streaming').on(table.streaming),
  // 新增索引：标记系统
  toolCallsCountIdx: index('idx_request_logs_tool_calls_count').on(table.toolCallsCount),
  conversationIdIdx: index('idx_request_logs_conversation_id').on(table.conversationId),
  statusCreatedAtIdx: index('idx_request_logs_status_created_at').on(table.status, table.createdAt),
  
  // Phase 1 新增索引：流状态追踪
  streamStatusIdx: index('idx_request_logs_stream_status').on(table.streamStatus),
  isCompleteIdx: index('idx_request_logs_is_complete').on(table.isComplete),
  streamStatusIsCompleteIdx: index('idx_stream_status_complete')
    .on(table.streamStatus, table.isComplete),
  lastUpdatedAtIdx: index('idx_request_logs_last_updated_at').on(table.lastUpdatedAt),
}));

export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;
