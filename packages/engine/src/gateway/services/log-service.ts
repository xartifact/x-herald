import { eq } from 'drizzle-orm';

import { IS_PRODUCTION } from '../../config/env';
import { getDatabase } from '../../db/client';
import logger from '../../lib/logger';
import type { VirtualKey } from '../../features/keys/db';
import { requestLogs, requestAttempts } from '../../features/logs/db';
import type { FailoverReason } from '../../features/logs/db';
import { costService } from '../../features/costs/service';

import { extractMetadata } from './metadata-extractor';
import { rateLimitEngine } from './rate-limit-engine';
import { estimateUsageFromContent } from './token-estimator';

export type { StreamLogParams, LogStartResult, FinalizeStreamParams } from './log-stream';
export {
  logStreamStart,
  logRequestStart,
  logStartAsync,
  upgradeToStreamLog,
  updateStreamProgress,
  finalizeStreamLog,
  markStreamFailed,
  markStreamAborted,
  markAttemptFailed,
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
  transformedRequestBody?: unknown;
  providerResponseHeaders?: Record<string, string>;
  clientResponseHeaders?: Record<string, string>;
  providerResponseBody?: unknown;
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
  attemptId?: string;
  requestGroupId?: string;
  candidateIndex?: number;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface LogData {
  metadata: ReturnType<typeof extractMetadata>;
  inputTokens: number;
  outputTokens: number;
  toolCallsCount: number;
}

function buildLogData(params: LogRequestParams): LogData {
  const metadata = extractMetadata({
    requestBody: params.requestBody,
    responseBody: params.responseBody,
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

function buildLogInsertValues(params: LogRequestParams, { metadata, inputTokens, outputTokens, toolCallsCount }: LogData): AnyRecord {
  return {
    requestGroupId: params.requestGroupId ?? crypto.randomUUID(),
    candidateIndex: params.candidateIndex ?? 0,
    virtualKeyId: params.virtualKey.id, virtualKeyName: params.virtualKey.name,
    modelName: params.modelName, originalModelName: params.originalModelName,
    providerId: params.providerId, providerName: params.providerName,
    status: params.status, statusCode: params.statusCode, responseTimeMs: params.responseTimeMs,
    inputTokens, outputTokens, totalTokens: inputTokens + outputTokens,
    requestHeaders: params.requestHeaders,
    requestBody: params.requestBody,
    clientResponseHeaders: params.clientResponseHeaders,
    responseBody: params.responseBody,
    errorMessage: params.errorMessage, errorType: params.errorType,
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
    const totalTokens = inputTokens + outputTokens;
    if (params.virtualKey?.id && totalTokens > 0) {
      rateLimitEngine.check(params.virtualKey.id, {}, totalTokens);
    }
    const db = getDatabase();

    if (params.logId) {
      await db.update(requestLogs).set({
        status: params.status, statusCode: params.statusCode, responseTimeMs: params.responseTimeMs,
        inputTokens, outputTokens, totalTokens: inputTokens + outputTokens,
        streaming: params.streaming ? 'true' : 'false',
        clientResponseHeaders: params.clientResponseHeaders as AnyRecord,
        responseBody: params.responseBody as AnyRecord,
        errorMessage: params.errorMessage, errorType: params.errorType,
        isComplete: true, streamStatus: 'completed', streamCompletedAt: new Date(), lastUpdatedAt: new Date(),
        metadata: metadata as AnyRecord, toolCallsCount, retryCount: params.retryCount ?? 0,
      }).where(eq(requestLogs.id, params.logId));

      if (params.attemptId && !params.attemptId.startsWith('temp-')) {
        await db.update(requestAttempts).set({
          status: params.status,
          statusCode: params.statusCode,
          durationMs: params.responseTimeMs,
          ...(params.providerTtfbMs !== undefined && { ttfbMs: params.providerTtfbMs }),
          retryCount: params.retryCount ?? 0,
          providerResponseBody: params.providerResponseBody as AnyRecord,
          providerResponseHeaders: params.providerResponseHeaders as AnyRecord,
        }).where(eq(requestAttempts.id, params.attemptId));
      }

      if (params.providerName && inputTokens + outputTokens > 0) {
        await costService.recordCost({
          requestLogId: params.logId,
          keyId: params.virtualKey.id,
          keyName: params.virtualKey.name,
          modelName: params.modelName,
          providerName: params.providerName,
          inputTokens,
          outputTokens,
        });
      }

      logger.debug({ logId: params.logId, modelName: params.modelName, status: params.status }, 'Request log updated');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logResult = await (db.insert(requestLogs) as any).values(buildLogInsertValues(params, logData)).returning({ id: requestLogs.id });
    const logId = logResult[0].id;

    await db.insert(requestAttempts).values({
      requestLogId: logId,
      requestGroupId: params.requestGroupId ?? logId,
      candidateIndex: params.candidateIndex ?? 0,
      instanceId: params.routingTrace?.instanceId,
      providerId: params.providerId,
      providerName: params.providerName,
      targetProtocol: params.targetProtocol,
      status: params.status,
      statusCode: params.statusCode,
      durationMs: params.responseTimeMs,
      ...(params.providerTtfbMs !== undefined && { ttfbMs: params.providerTtfbMs }),
      retryCount: params.retryCount ?? 0,
      transformedRequestBody: params.transformedRequestBody as AnyRecord,
      providerRequestHeaders: params.providerRequestHeaders as AnyRecord,
      providerResponseBody: params.providerResponseBody as AnyRecord,
      providerResponseHeaders: params.providerResponseHeaders as AnyRecord,
      createdAt: new Date(),
    });

    if (params.providerName && inputTokens + outputTokens > 0) {
      await costService.recordCost({
        requestLogId: logId,
        keyId: params.virtualKey.id,
        keyName: params.virtualKey.name,
        modelName: params.modelName,
        providerName: params.providerName,
        inputTokens,
        outputTokens,
      });
    }

    const { recordClientRequestedModel } = await import('../../features/logs/services/client-model-recorder');
    await recordClientRequestedModel(params.originalModelName || params.modelName);
    logger.debug({ modelName: params.modelName, status: params.status }, 'Request logged successfully');
  } catch (error) {
    const errorDetails = error instanceof Error ? { message: error.message, name: error.name, stack: error.stack } : error;
    logger.error({ error: errorDetails, modelName: params.modelName, virtualKeyId: params.virtualKey.id }, 'Failed to log request');
    if (!IS_PRODUCTION) throw error;
  }
}

export async function markLogAsFailed(params: {
  logId: string;
  attemptId: string;
  statusCode: number;
  errorMessage: string;
  failoverReason?: FailoverReason;
  retryCount?: number;
  responseTimeMs?: number;
  providerResponseBody?: unknown;
  providerTtfbMs?: number;
}): Promise<void> {
  const { logId, attemptId } = params;
  if (!logId || logId.startsWith('temp-')) return;
  try {
    const db = getDatabase();
    await db.update(requestLogs).set({
      status: 'failure',
      statusCode: params.statusCode,
      errorMessage: params.errorMessage,
      failoverReason: params.failoverReason,
      isComplete: true,
      streamStatus: 'failed',
      lastUpdatedAt: new Date(),
      ...(params.retryCount !== undefined && { retryCount: params.retryCount }),
      ...(params.responseTimeMs !== undefined && { responseTimeMs: params.responseTimeMs }),
    }).where(eq(requestLogs.id, logId));

    if (attemptId && !attemptId.startsWith('temp-')) {
      await db.update(requestAttempts).set({
        status: 'failure',
        statusCode: params.statusCode,
        failoverReason: params.failoverReason,
        retryCount: params.retryCount ?? 0,
        ...(params.responseTimeMs !== undefined && { durationMs: params.responseTimeMs }),
        ...(params.providerTtfbMs !== undefined && { ttfbMs: params.providerTtfbMs }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(params.providerResponseBody !== undefined && { providerResponseBody: params.providerResponseBody as any }),
      }).where(eq(requestAttempts.id, attemptId));
    }

    logger.debug({ logId, attemptId, statusCode: params.statusCode }, 'Log marked as failed (failover)');
  } catch (error) {
    logger.warn({ error, logId }, 'Failed to mark log as failed');
  }
}
