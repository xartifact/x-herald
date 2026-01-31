import { getDatabase } from '@/core/db/client';
import { requestLogs } from '@/features/logs/db';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';

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
  requestBody?: unknown;
  transformedRequestBody?: unknown;
  responseHeaders?: Record<string, string>;
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
}

/**
 * 记录请求日志
 */
export async function logRequest(params: LogRequestParams): Promise<void> {
  try {
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
      inputTokens: params.inputTokens || 0,
      outputTokens: params.outputTokens || 0,
      totalTokens: (params.inputTokens || 0) + (params.outputTokens || 0),
      requestHeaders: params.requestHeaders,
      requestBody: params.requestBody,
      transformedRequestBody: params.transformedRequestBody,
      responseHeaders: params.responseHeaders,
      responseBody: params.responseBody,
      errorMessage: params.errorMessage,
      errorType: params.errorType,
      clientIp: params.clientIp,
      userAgent: params.userAgent,
      requestPath: params.requestPath,
      requestMethod: params.requestMethod,
      streaming: params.streaming ? 'true' : 'false',
      incomingProtocol: params.incomingProtocol,
      targetProtocol: params.targetProtocol,
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
