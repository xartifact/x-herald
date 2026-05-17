import { eq, sql } from 'drizzle-orm';

import { IS_PRODUCTION } from '@/core/config/env';
import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';
import { requestLogs } from '@/features/logs/db';

import { extractMetadata } from './metadata-extractor';
import { estimateUsageFromContent } from './token-estimator';

export type { StreamLogParams } from './log-stream';
export {
  logStreamStart,
  logRequestStart,
  upgradeToStreamLog,
  updateStreamProgress,
  finalizeStreamLog,
  markStreamFailed,
  markStreamAborted,
} from './log-stream';

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
  providerRequestHeaders?: Record<string, string>;
  requestBody?: unknown;
  standardRequestBody?: unknown;
  transformedRequestBody?: unknown;
  providerResponseHeaders?: Record<string, string>;
  clientResponseHeaders?: Record<string, string>;
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
  conversationId?: string;
  userId?: string;
  organizationId?: string;
  tags?: string[];
  logId?: string;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface LogData {
  metadata: ReturnType<typeof extractMetadata>;
  inputTokens: number;
  outputTokens: number;
  toolCallsCount: number;
}

function buildLogData(params: LogRequestParams): LogData {
  const metadata = extractMetadata({
    requestBody: params.requestBody, standardRequestBody: params.standardRequestBody,
    standardResponseBody: params.standardResponseBody, responseBody: params.responseBody,
    errorMessage: params.errorMessage, errorType: params.errorType, statusCode: params.statusCode,
    responseTimeMs: params.responseTimeMs, gatewayOverheadMs: params.gatewayOverheadMs,
    providerTtfbMs: params.providerTtfbMs, streamDurationMs: params.streamDurationMs,
    conversationId: params.conversationId, userId: params.userId, organizationId: params.organizationId, tags: params.tags,
  });
  if (params.originalModelName || params.mappingType) {
    metadata.modelMapping = { originalModel: params.originalModelName, mappingType: params.mappingType, isMapped: params.isMapped };
  }
  if (params.routingTrace || params.originalModelName) {
    metadata.routing = { requestedModel: params.originalModelName || params.modelName, ...params.routingTrace };
  }
  const toolCallsCount = metadata.toolCalls?.tools?.length || 0;
  let inputTokens = params.inputTokens || 0;
  let outputTokens = params.outputTokens || 0;
  if (!inputTokens && !outputTokens) {
    logger.warn({ modelName: params.modelName, provider: params.providerName }, 'No usage information from provider, using estimation');
    const estimated = estimateUsageFromContent(params.requestBody, params.responseBody);
    inputTokens = estimated.inputTokens;
    outputTokens = estimated.outputTokens;
    metadata.performance = { ...metadata.performance, usageEstimated: true };
  }
  return { metadata, inputTokens, outputTokens, toolCallsCount };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function buildInsertValues(params: LogRequestParams, { metadata, inputTokens, outputTokens, toolCallsCount }: LogData): AnyRecord {
  return {
    virtualKeyId: params.virtualKey.id, virtualKeyName: params.virtualKey.name,
    modelName: params.modelName, originalModelName: params.originalModelName,
    providerId: params.providerId, providerName: params.providerName,
    status: params.status, statusCode: params.statusCode, responseTimeMs: params.responseTimeMs,
    inputTokens, outputTokens, totalTokens: inputTokens + outputTokens,
    requestHeaders: params.requestHeaders, providerRequestHeaders: params.providerRequestHeaders,
    requestBody: params.requestBody, standardRequestBody: params.standardRequestBody,
    transformedRequestBody: params.transformedRequestBody,
    providerResponseHeaders: params.providerResponseHeaders, clientResponseHeaders: params.clientResponseHeaders,
    providerResponseBody: params.providerResponseBody, standardResponseBody: params.standardResponseBody,
    responseBody: params.responseBody, errorMessage: params.errorMessage, errorType: params.errorType,
    clientIp: params.clientIp, userAgent: params.userAgent, clientType: params.clientType,
    requestPath: params.requestPath, requestMethod: params.requestMethod,
    streaming: params.streaming ? 'true' : 'false',
    incomingProtocol: params.incomingProtocol, targetProtocol: params.targetProtocol,
    metadata, toolCallsCount, retryCount: params.retryCount ?? 0, conversationId: params.conversationId,
    streamStatus: 'completed', isComplete: true, createdAt: new Date(),
    streamStartedAt: params.streaming ? new Date(Date.now() - params.responseTimeMs) : new Date(),
    streamCompletedAt: new Date(), lastUpdatedAt: new Date(),
    streamContent: params.streaming && isObject(params.responseBody) ? (params.responseBody.streamContent ?? null) : null,
    streamProgress: params.streaming && isObject(params.responseBody) ? (params.responseBody.streamProgress ?? null) : null,
  };
}

export async function logRequest(params: LogRequestParams): Promise<void> {
  try {
    const logData = buildLogData(params);
    const { metadata, inputTokens, outputTokens, toolCallsCount } = logData;
    const db = getDatabase();

    if (params.logId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(requestLogs).set({
        status: params.status, statusCode: params.statusCode, responseTimeMs: params.responseTimeMs,
        inputTokens, outputTokens, totalTokens: inputTokens + outputTokens,
        streaming: params.streaming ? 'true' : 'false',
        providerResponseHeaders: params.providerResponseHeaders as AnyRecord,
        clientResponseHeaders: params.clientResponseHeaders as AnyRecord,
        providerResponseBody: params.providerResponseBody as AnyRecord,
        standardResponseBody: params.standardResponseBody as AnyRecord,
        responseBody: params.responseBody as AnyRecord,
        errorMessage: params.errorMessage, errorType: params.errorType,
        isComplete: true, streamStatus: 'completed', streamCompletedAt: new Date(), lastUpdatedAt: new Date(),
        metadata: metadata as AnyRecord, toolCallsCount, retryCount: params.retryCount ?? 0,
      }).where(eq(requestLogs.id, params.logId));
      logger.debug({ logId: params.logId, modelName: params.modelName, status: params.status }, 'Request log updated');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(requestLogs).values(buildInsertValues(params, logData) as any);
    const { recordClientRequestedModel } = await import('@/features/logs/services/client-model-recorder');
    await recordClientRequestedModel(params.originalModelName || params.modelName);
    logger.debug({ modelName: params.modelName, status: params.status }, 'Request logged successfully');
  } catch (error) {
    const errorDetails = error instanceof Error ? { message: error.message, name: error.name, stack: error.stack } : error;
    logger.error({ error: errorDetails, modelName: params.modelName, virtualKeyId: params.virtualKey.id }, 'Failed to log request');
    if (!IS_PRODUCTION) throw error;
  }
}

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
    await db.update(requestLogs).set({
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
    }).where(eq(requestLogs.id, logId));
    logger.debug({ logId, statusCode }, 'Log marked as failed (failover)');
  } catch (error) {
    logger.warn({ error, logId }, 'Failed to mark log as failed');
  }
}
