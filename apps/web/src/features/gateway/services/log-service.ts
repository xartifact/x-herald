import { getDatabase } from '@/core/db/client';
import { requestLogs } from '@/features/logs/db';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';
import { extractMetadata } from './metadata-extractor';
import { estimateUsageFromContent } from './token-estimator';

export interface LogRequestParams {
  virtualKey: VirtualKey;
  modelName: string;
  providerId?: string;
  providerName?: string;
  status: 'success' | 'failure';
  statusCode?: number;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  requestHeaders?: Record<string, string>;
  // 请求链路追踪
  requestBody?: unknown;
  standardRequestBody?: unknown;
  transformedRequestBody?: unknown;
  responseHeaders?: Record<string, string>;
  // 响应链路追踪
  providerResponseBody?: unknown;
  standardResponseBody?: unknown;
  responseBody?: unknown;
  errorMessage?: string;
  errorType?: string;
  clientIp?: string;
  userAgent?: string;
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
      latencyMs: params.latencyMs,
      conversationId: params.conversationId,
      userId: params.userId,
      organizationId: params.organizationId,
      tags: params.tags,
    });

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
    await db.insert(requestLogs).values({
      virtualKeyId: params.virtualKey.id,
      virtualKeyName: params.virtualKey.name,
      modelName: params.modelName,
      providerId: params.providerId,
      providerName: params.providerName,
      status: params.status,
      statusCode: params.statusCode,
      latencyMs: params.latencyMs,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      requestHeaders: params.requestHeaders,
      requestBody: params.requestBody,
      standardRequestBody: params.standardRequestBody as any,
      transformedRequestBody: params.transformedRequestBody,
      responseHeaders: params.responseHeaders,
      providerResponseBody: params.providerResponseBody as any,
      standardResponseBody: params.standardResponseBody as any,
      responseBody: params.responseBody as any,
      errorMessage: params.errorMessage,
      errorType: params.errorType,
      clientIp: params.clientIp,
      userAgent: params.userAgent,
      requestPath: params.requestPath,
      requestMethod: params.requestMethod,
      streaming: params.streaming ? 'true' : 'false',
      incomingProtocol: params.incomingProtocol,
      targetProtocol: params.targetProtocol,
      // 新增字段：标记系统
      metadata: metadata as any,
      toolCallsCount,
      conversationId: params.conversationId,
    });
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
    if (process.env.NODE_ENV !== 'production') {
      throw error;
    }
  }
}
