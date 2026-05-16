import { eq, sql } from 'drizzle-orm';

import { IS_PRODUCTION } from '@/core/config/env';
import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';
import { requestLogs } from '@/features/logs/db';
import type { StreamProgress, StreamContent, LogMetadata } from '@/features/logs/db';

import { extractMetadata } from './metadata-extractor';
import { estimateUsageFromContent } from './token-estimator';

export interface LogRequestParams {
  virtualKey: VirtualKey;
  modelName: string;
  originalModelName?: string;
  mappingType?: 'virtual' | 'exact' | 'alias' | 'fallback' | null;
  isMapped?: boolean;
  providerId?: string;
  providerName?: string;
  status: 'success' | 'failure' | 'pending';
  statusCode?: number;
  responseTimeMs: number;
  inputTokens?: number;
  outputTokens?: number;
  requestHeaders?: Record<string, string>;
  // 请求头链路追踪
  providerRequestHeaders?: Record<string, string>;  // Provider 请求头
  // 请求链路追踪
  requestBody?: unknown;
  standardRequestBody?: unknown;
  transformedRequestBody?: unknown;
  // 响应头链路追踪
  providerResponseHeaders?: Record<string, string>;
  clientResponseHeaders?: Record<string, string>;
  // 响应链路追踪
  providerResponseBody?: unknown;
  standardResponseBody?: unknown;
  responseBody?: unknown;
  errorMessage?: string;
  errorType?: string;
  clientIp?: string;
  userAgent?: string;
  clientType?: string;
  requestPath: string;
  requestMethod: string;
  streaming: boolean;
  incomingProtocol?: string;
  targetProtocol?: string;
  // 新增：标记系统
  conversationId?: string;
  userId?: string;
  organizationId?: string;
  tags?: string[];
  logId?: string;
  // 链路分段时间戳
  gatewayOverheadMs?: number;
  providerTtfbMs?: number;
  streamDurationMs?: number;
  retryCount?: number;
  routingTrace?: {
    matchedRuleId?: string;
    matchedRuleName?: string;
    matchedRulePriority?: number;
    modelGroupId?: string;
    modelGroupName?: string;
    instanceId?: string;
    actualModelName?: string;
    strategy?: string;
    responseModelName?: string;
  };
}

/**
 * 类型安全的对象检查辅助函数
 */
function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

/**
 * 记录请求日志
 */
export async function logRequest(params: LogRequestParams): Promise<void> {
  try {
    // 提取元数据
    const metadata = extractMetadata({
      requestBody: params.requestBody,
      standardRequestBody: params.standardRequestBody,
      standardResponseBody: params.standardResponseBody,
      responseBody: params.responseBody,
      errorMessage: params.errorMessage,
      errorType: params.errorType,
      statusCode: params.statusCode,
      responseTimeMs: params.responseTimeMs,
      gatewayOverheadMs: params.gatewayOverheadMs,
      providerTtfbMs: params.providerTtfbMs,
      streamDurationMs: params.streamDurationMs,
      conversationId: params.conversationId,
      userId: params.userId,
      organizationId: params.organizationId,
      tags: params.tags,
    });

    // 添加模型映射信息到元数据
    if (params.originalModelName || params.mappingType) {
      metadata.modelMapping = {
        originalModel: params.originalModelName,
        mappingType: params.mappingType,
        isMapped: params.isMapped,
      };
    }

    // 添加路由追踪信息
    if (params.routingTrace || params.originalModelName) {
      metadata.routing = {
        requestedModel: params.originalModelName || params.modelName,
        ...params.routingTrace,
      };
    }

    // 计算工具调用次数
    const toolCallsCount = metadata.toolCalls?.tools?.length || 0;

    // Token 回退机制：如果没有 usage 信息，使用估算
    let inputTokens = params.inputTokens || 0;
    let outputTokens = params.outputTokens || 0;

    if (!inputTokens && !outputTokens) {
      logger.warn(
        { modelName: params.modelName, provider: params.providerName },
        'No usage information from provider, using estimation'
      );

      const estimated = estimateUsageFromContent(
        params.requestBody,
        params.responseBody
      );

      inputTokens = estimated.inputTokens;
      outputTokens = estimated.outputTokens;

      // 在元数据中标记这是估算值
      metadata.performance = {
        ...metadata.performance,
        usageEstimated: true,
      };
    }

    const db = getDatabase();
    // 如果提供了 logId，则更新现有记录而非插入新记录
    if (params.logId) {
      await db
        .update(requestLogs)
        .set({
          status: params.status,
          statusCode: params.statusCode,
          responseTimeMs: params.responseTimeMs,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          streaming: params.streaming ? 'true' : 'false',
          providerResponseHeaders: params.providerResponseHeaders as any,
          clientResponseHeaders: params.clientResponseHeaders as any,
          providerResponseBody: params.providerResponseBody as any,
          standardResponseBody: params.standardResponseBody as any,
          responseBody: params.responseBody as any,
          errorMessage: params.errorMessage,
          errorType: params.errorType,
          isComplete: true,
          streamStatus: 'completed',
          streamCompletedAt: new Date(),
          lastUpdatedAt: new Date(),
          metadata: metadata as any,
          toolCallsCount,
          retryCount: params.retryCount ?? 0,
        })
        .where(eq(requestLogs.id, params.logId));
      logger.debug({ logId: params.logId, modelName: params.modelName, status: params.status }, 'Request log updated');
      return;
    }

    await db.insert(requestLogs).values({
      virtualKeyId: params.virtualKey.id,
      virtualKeyName: params.virtualKey.name,
      modelName: params.modelName,
      originalModelName: params.originalModelName,
      providerId: params.providerId,
      providerName: params.providerName,
      status: params.status,
      statusCode: params.statusCode,
      responseTimeMs: params.responseTimeMs,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      requestHeaders: params.requestHeaders,
      providerRequestHeaders: params.providerRequestHeaders,
      requestBody: params.requestBody,
      standardRequestBody: params.standardRequestBody as any,
      transformedRequestBody: params.transformedRequestBody,
      providerResponseHeaders: params.providerResponseHeaders,
      clientResponseHeaders: params.clientResponseHeaders,
      providerResponseBody: params.providerResponseBody as any,
      standardResponseBody: params.standardResponseBody as any,
      responseBody: params.responseBody as any,
      errorMessage: params.errorMessage,
      errorType: params.errorType,
      clientIp: params.clientIp,
      userAgent: params.userAgent,
      clientType: params.clientType,
      requestPath: params.requestPath,
      requestMethod: params.requestMethod,
      streaming: params.streaming ? 'true' : 'false',
      incomingProtocol: params.incomingProtocol,
      targetProtocol: params.targetProtocol,
      // 新增字段：标记系统
      metadata: metadata as any,
      toolCallsCount,
      retryCount: params.retryCount ?? 0,
      conversationId: params.conversationId,

      // Phase 1 新增：流状态字段
      // 无论流式还是非流式，都标记为已完成
      streamStatus: 'completed',
      isComplete: true,
      // 显式设置 UTC 时间戳，避免 PGlite defaultNow() 时区偏差
      createdAt: new Date(),
      streamStartedAt: params.streaming ? new Date(Date.now() - params.responseTimeMs) : new Date(),
      streamCompletedAt: new Date(),
      lastUpdatedAt: new Date(),

      // Phase 1 新增：从响应体中提取流内容和进度
      streamContent:
        params.streaming && isObject(params.responseBody)
          ? (params.responseBody.streamContent as any)
          : null,
      streamProgress:
        params.streaming && isObject(params.responseBody)
          ? (params.responseBody.streamProgress as any)
          : null,
    });
    // 记录客户端请求的模型名称
    const { recordClientRequestedModel } = await import("@/features/logs/services/client-model-recorder");
    await recordClientRequestedModel(params.originalModelName || params.modelName);

    logger.debug({ modelName: params.modelName, status: params.status }, 'Request logged successfully');
  } catch (error) {
    const errorDetails = error instanceof Error ? {
      message: error.message,
      name: error.name,
      stack: error.stack,
    } : error;

    logger.error(
      { error: errorDetails, modelName: params.modelName, virtualKeyId: params.virtualKey.id },
      'Failed to log request'
    );

    // 非生产环境抛出错误以便调试
    if (!IS_PRODUCTION) {
      throw error;
    }
  }
}

// ============================================================================
// Phase 2: 实时流日志函数
// ============================================================================

interface StreamLogParams {
  virtualKey: VirtualKey;
  modelName: string;
  originalModelName?: string;
  mappingType?: 'virtual' | 'exact' | 'alias' | 'fallback' | null;
  isMapped?: boolean;
  providerId: string;
  providerName: string;
  requestHeaders: Record<string, string>;
  providerRequestHeaders?: Record<string, string>;
  requestBody: unknown;
  standardRequestBody?: unknown;
  transformedRequestBody?: unknown;
  clientIp?: string;
  userAgent?: string;
  clientType?: string;
  requestPath: string;
  requestMethod: string;
  incomingProtocol?: string;
  targetProtocol?: string;
  conversationId?: string;
  routingTrace?: {
    matchedRuleId?: string;
    matchedRuleName?: string;
    matchedRulePriority?: number;
    modelGroupId?: string;
    modelGroupName?: string;
    instanceId?: string;
    actualModelName?: string;
    strategy?: string;
    responseModelName?: string;
  };
}

async function createStreamLog(params: StreamLogParams & { isStream: boolean }): Promise<string> {
  try {
    const db = getDatabase();

    const streamStatus = params.isStream ? 'streaming' : 'pending';
    const streaming = params.isStream ? 'true' : 'false';

    const metadata: LogMetadata = {};
    if (params.originalModelName || params.mappingType) {
      metadata.modelMapping = {
        originalModel: params.originalModelName,
        mappingType: params.mappingType,
        isMapped: params.isMapped,
      };
    }
    if (params.routingTrace || params.originalModelName) {
      metadata.routing = {
        requestedModel: params.originalModelName || params.modelName,
        ...params.routingTrace,
      };
    }

    const result = await db
      .insert(requestLogs)
      .values({
        virtualKeyId: params.virtualKey.id,
        virtualKeyName: params.virtualKey.name,
        modelName: params.modelName,
        originalModelName: params.originalModelName,
        providerId: params.providerId,
        providerName: params.providerName,
        status: 'pending',
        streamStatus,
        isComplete: false,
        statusCode: 200,
        responseTimeMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        requestHeaders: params.requestHeaders as any,
        providerRequestHeaders: params.providerRequestHeaders as any,
        requestBody: params.requestBody as any,
        standardRequestBody: params.standardRequestBody as any,
        transformedRequestBody: params.transformedRequestBody as any,
        clientIp: params.clientIp,
        userAgent: params.userAgent,
        clientType: params.clientType,
        requestPath: params.requestPath,
        requestMethod: params.requestMethod,
        streaming,
        incomingProtocol: params.incomingProtocol,
        targetProtocol: params.targetProtocol,
        conversationId: params.conversationId,
        metadata: metadata as any,
        createdAt: new Date(),
        ...(params.isStream && { streamStartedAt: new Date() }),
      })
      .returning({ id: requestLogs.id });

    logger.debug({ logId: result[0].id }, 'Stream log created');
    return result[0].id;
  } catch (error) {
    logger.error({ error }, 'Failed to create stream log');
    return 'temp-' + Date.now();
  }
}

/**
 * 创建流开始日志
 * 返回日志 ID 用于后续更新
 */
export async function logStreamStart(params: StreamLogParams): Promise<string> {
  const logId = await createStreamLog({ ...params, isStream: true });
  // recordClientRequestedModel only for streaming requests (original behavior)
  const { recordClientRequestedModel } = await import("@/features/logs/services/client-model-recorder");
  await recordClientRequestedModel(params.originalModelName || params.modelName);
  return logId;
}

/**
 * 创建非流式请求的开始日志
 * 返回日志 ID 用于后续更新
 */
export async function logRequestStart(params: StreamLogParams): Promise<string> {
  return createStreamLog({ ...params, isStream: false });
}


/**
 * 将已有的请求日志升级为流式状态
 * 用于预创建日志后进入流式处理时更新状态
 */
export async function upgradeToStreamLog(logId: string): Promise<void> {
  if (!logId || logId.startsWith('temp-')) return;
  try {
    const db = getDatabase();
    await db
      .update(requestLogs)
      .set({
        streaming: 'true',
        streamStatus: 'streaming',
        streamStartedAt: new Date(),
        lastUpdatedAt: new Date(),
      })
      .where(eq(requestLogs.id, logId));
    logger.debug({ logId }, 'Log upgraded to streaming');
  } catch (error) {
    logger.warn({ error, logId }, 'Failed to upgrade log to streaming');
  }
}

/**
 * 更新流进度
 * 仅更新进度和部分内容，不阻塞流传输
 */
export async function updateStreamProgress(
  logId: string,
  progress: StreamProgress,
  partialContent?: Partial<StreamContent>
): Promise<void> {
  // 跳过临时 ID（初始日志创建失败时使用）
  if (!logId || logId.startsWith('temp-')) {
    logger.warn({ logId }, 'Skipping progress update for temporary log ID');
    return;
  }
  try {
    const db = getDatabase();

    await db
      .update(requestLogs)
      .set({
        streamProgress: progress as any,
        streamContent: partialContent as any,
        lastUpdatedAt: new Date(),
      })
      .where(eq(requestLogs.id, logId));

    logger.debug(
      { logId, chunksProcessed: progress.chunksProcessed },
      'Stream progress updated'
    );
  } catch (error) {
    // 不要抛出错误，避免影响流传输
    logger.warn({ error, logId }, 'Failed to update stream progress');
  }
}

/**
 * 完成流日志
 * 记录最终的完整数据和 tokens
 */
export async function finalizeStreamLog(
  logId: string,
  params: {
    status: 'success' | 'failure';
    statusCode: number;
    startTime: number;
    inputTokens: number;
    outputTokens: number;
    usageEstimated: boolean;
    providerRequestHeaders?: Record<string, string>;
    providerResponseHeaders: Record<string, string>;
    clientResponseHeaders: Record<string, string>;
    providerResponseBody: unknown;
    standardResponseBody: unknown;
    responseBody: unknown;
    streamContent: StreamContent;
    streamProgress: StreamProgress;
    metadata?: LogMetadata;
    toolCallsCount?: number;
    retryCount?: number;
    ttfbToFirstThinkingMs?: number;
    ttfbToFirstTextMs?: number;
    thinkingDurationMs?: number;
  }
): Promise<void> {
  // 跳过临时 ID（初始日志创建失败时使用）
  if (!logId || logId.startsWith('temp-')) {
    logger.warn({ logId }, 'Skipping finalization for temporary log ID');
    return;
  }
  try {
    const responseTimeMs = Date.now() - params.startTime;
    const db = getDatabase();

    await db
      .update(requestLogs)
      .set({
        status: params.status,
        streamStatus: 'completed',
        isComplete: true,
        statusCode: params.statusCode,
        responseTimeMs,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        totalTokens: params.inputTokens + params.outputTokens,
        providerResponseHeaders: params.providerResponseHeaders as any,
        clientResponseHeaders: params.clientResponseHeaders as any,
        providerResponseBody: params.providerResponseBody as any,
        standardResponseBody: params.standardResponseBody as any,
        responseBody: params.responseBody as any,
        streamContent: params.streamContent as any,
        streamProgress: params.streamProgress as any,
        metadata: {
          ...params.metadata,
          performance: {
            ...params.metadata?.performance,
            usageEstimated: params.usageEstimated,
            ...(params.ttfbToFirstThinkingMs != null && { ttfbToFirstThinkingMs: params.ttfbToFirstThinkingMs }),
            ...(params.ttfbToFirstTextMs != null && { ttfbToFirstTextMs: params.ttfbToFirstTextMs }),
            ...(params.thinkingDurationMs != null && { thinkingDurationMs: params.thinkingDurationMs }),
          },
          // 响应中有 thinking 内容时，覆盖请求端检测的 thinkingMode（模型可能默认开启 thinking）
          // ttfbToFirstThinkingMs != null 表示 stream 中检测到了 thinking chunk（即使后续没有文本）
          ...((params.thinkingDurationMs != null || params.ttfbToFirstThinkingMs != null) && {
            request: {
              ...params.metadata?.request,
              thinkingMode: true,
            },
          }),
        } as any,
        toolCallsCount: params.toolCallsCount,
        retryCount: params.retryCount ?? 0,
        streamCompletedAt: new Date(),
        lastUpdatedAt: new Date(),
      })
      .where(eq(requestLogs.id, logId));

    logger.debug(
      { logId, responseTimeMs, tokens: params.inputTokens + params.outputTokens },
      'Stream log finalized'
    );
  } catch (error) {
    logger.error({ error, logId }, 'Failed to finalize stream log');
    // 非生产环境抛出错误
    if (!IS_PRODUCTION) {
      throw error;
    }
  }
}

/**
 * 标记流失败
 */
export async function markStreamFailed(
  logId: string,
  error: { message: string; type?: string; statusCode?: number }
): Promise<void> {
  if (!logId || logId.startsWith('temp-')) {
    logger.warn({ logId }, 'Skipping failure mark for temporary log ID');
    return;
  }
  try {
    const db = getDatabase();

    await db
      .update(requestLogs)
      .set({
        status: 'failure',
        streamStatus: 'failed',
        isComplete: true,
        errorMessage: error.message,
        errorType: error.type,
        statusCode: error.statusCode,
        lastUpdatedAt: new Date(),
      })
      .where(eq(requestLogs.id, logId));

    logger.debug({ logId, error }, 'Stream marked as failed');
  } catch (err) {
    logger.warn({ error: err, logId }, 'Failed to mark stream as failed');
  }
}

/**
 * 标记流中止（客户端断开）
 */
/**
 * 将 pending 日志标记为失败（故障转移时中间候选实例的日志清理）
 */
export async function markLogAsFailed(
  logId: string,
  statusCode: number,
  errorMessage: string,
  retryCount?: number,
  responseTimeMs?: number,
  providerResponseBody?: unknown,
  providerTtfbMs?: number,
): Promise<void> {
  if (!logId || logId.startsWith('temp-')) return;
  try {
    const db = getDatabase();
    await db
      .update(requestLogs)
      .set({
        status: 'failure',
        statusCode,
        errorMessage,
        isComplete: true,
        streamStatus: 'failed',
        lastUpdatedAt: new Date(),
        ...(retryCount !== undefined && { retryCount }),
        ...(responseTimeMs !== undefined && { responseTimeMs }),
        ...(providerResponseBody !== undefined && { providerResponseBody }),
        ...(providerTtfbMs !== undefined && {
          metadata: sql`jsonb_set(COALESCE(metadata, '{}'::jsonb), '{performance,providerTtfbMs}', to_jsonb(${providerTtfbMs}::real))`,
        }),
      })
      .where(eq(requestLogs.id, logId));
    logger.debug({ logId, statusCode }, 'Log marked as failed (failover)');
  } catch (error) {
    logger.warn({ error, logId }, 'Failed to mark log as failed');
  }
}

export async function markStreamAborted(logId: string): Promise<void> {
  if (!logId || logId.startsWith('temp-')) {
    logger.warn({ logId }, 'Skipping abort mark for temporary log ID');
    return;
  }
  try {
    const db = getDatabase();

    await db
      .update(requestLogs)
      .set({
        status: 'failure',
        streamStatus: 'aborted',
        isComplete: true,
        errorMessage: 'Client disconnected',
        errorType: 'client_disconnect',
        lastUpdatedAt: new Date(),
      })
      .where(eq(requestLogs.id, logId));

    logger.debug({ logId }, 'Stream marked as aborted');
  } catch (error) {
    logger.warn({ error, logId }, 'Failed to mark stream as aborted');
  }
}
