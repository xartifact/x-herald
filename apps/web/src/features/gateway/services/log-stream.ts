import { eq } from 'drizzle-orm';

import { IS_PRODUCTION } from '@/core/config/env';
import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';
import { requestLogs } from '@/features/logs/db';
import type { StreamProgress, StreamContent, LogMetadata } from '@/features/logs/db';

export interface StreamLogParams {
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

function buildInsertValues(params: StreamLogParams & { isStream: boolean }) {
  const streamStatus: 'streaming' | 'pending' = params.isStream ? 'streaming' : 'pending';
  const streaming: 'true' | 'false' = params.isStream ? 'true' : 'false';
  const metadata: LogMetadata = {};
  if (params.originalModelName || params.mappingType) {
    metadata.modelMapping = { originalModel: params.originalModelName, mappingType: params.mappingType, isMapped: params.isMapped };
  }
  if (params.routingTrace || params.originalModelName) {
    metadata.routing = { requestedModel: params.originalModelName || params.modelName, ...params.routingTrace };
  }
  return {
    virtualKeyId: params.virtualKey.id, virtualKeyName: params.virtualKey.name,
    modelName: params.modelName, originalModelName: params.originalModelName,
    providerId: params.providerId, providerName: params.providerName,
    status: 'pending' as const, streamStatus, isComplete: false, statusCode: 200,
    responseTimeMs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requestHeaders: params.requestHeaders as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    providerRequestHeaders: params.providerRequestHeaders as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requestBody: params.requestBody as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    standardRequestBody: params.standardRequestBody as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transformedRequestBody: params.transformedRequestBody as any,
    clientIp: params.clientIp, userAgent: params.userAgent, clientType: params.clientType,
    requestPath: params.requestPath, requestMethod: params.requestMethod, streaming,
    incomingProtocol: params.incomingProtocol, targetProtocol: params.targetProtocol,
    conversationId: params.conversationId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: metadata as any,
    createdAt: new Date(),
    ...(params.isStream && { streamStartedAt: new Date() }),
  };
}

async function createStreamLog(params: StreamLogParams & { isStream: boolean }): Promise<string> {
  try {
    const db = getDatabase();
    const result = await db.insert(requestLogs).values(buildInsertValues(params)).returning({ id: requestLogs.id });
    logger.debug({ logId: result[0].id }, 'Stream log created');
    return result[0].id;
  } catch (error) {
    logger.error({ error }, 'Failed to create stream log');
    return 'temp-' + Date.now();
  }
}

export async function logStreamStart(params: StreamLogParams): Promise<string> {
  const logId = await createStreamLog({ ...params, isStream: true });
  const { recordClientRequestedModel } = await import('@/features/logs/services/client-model-recorder');
  await recordClientRequestedModel(params.originalModelName || params.modelName);
  return logId;
}

export async function logRequestStart(params: StreamLogParams): Promise<string> {
  return createStreamLog({ ...params, isStream: false });
}

export async function upgradeToStreamLog(logId: string): Promise<void> {
  if (!logId || logId.startsWith('temp-')) return;
  try {
    const db = getDatabase();
    await db.update(requestLogs).set({ streaming: 'true', streamStatus: 'streaming', streamStartedAt: new Date(), lastUpdatedAt: new Date() }).where(eq(requestLogs.id, logId));
    logger.debug({ logId }, 'Log upgraded to streaming');
  } catch (error) {
    logger.warn({ error, logId }, 'Failed to upgrade log to streaming');
  }
}

export async function updateStreamProgress(logId: string, progress: StreamProgress, partialContent?: Partial<StreamContent>): Promise<void> {
  if (!logId || logId.startsWith('temp-')) {
    logger.warn({ logId }, 'Skipping progress update for temporary log ID');
    return;
  }
  try {
    const db = getDatabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(requestLogs).set({ streamProgress: progress as any, streamContent: partialContent as any, lastUpdatedAt: new Date() }).where(eq(requestLogs.id, logId));
    logger.debug({ logId, chunksProcessed: progress.chunksProcessed }, 'Stream progress updated');
  } catch (error) {
    logger.warn({ error, logId }, 'Failed to update stream progress');
  }
}

export interface FinalizeStreamParams {
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

function buildFinalizeValues(params: FinalizeStreamParams, responseTimeMs: number) {
  return {
    status: params.status, streamStatus: 'completed' as const, isComplete: true,
    statusCode: params.statusCode, responseTimeMs,
    inputTokens: params.inputTokens, outputTokens: params.outputTokens,
    totalTokens: params.inputTokens + params.outputTokens,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    providerResponseHeaders: params.providerResponseHeaders as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientResponseHeaders: params.clientResponseHeaders as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    providerResponseBody: params.providerResponseBody as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    standardResponseBody: params.standardResponseBody as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    responseBody: params.responseBody as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    streamContent: params.streamContent as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      ...((params.thinkingDurationMs != null || params.ttfbToFirstThinkingMs != null) && {
        request: { ...params.metadata?.request, thinkingMode: true },
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    toolCallsCount: params.toolCallsCount,
    retryCount: params.retryCount ?? 0,
    streamCompletedAt: new Date(),
    lastUpdatedAt: new Date(),
  };
}

export async function finalizeStreamLog(logId: string, params: FinalizeStreamParams): Promise<void> {
  if (!logId || logId.startsWith('temp-')) {
    logger.warn({ logId }, 'Skipping finalization for temporary log ID');
    return;
  }
  try {
    const responseTimeMs = Date.now() - params.startTime;
    const db = getDatabase();
    await db.update(requestLogs).set(buildFinalizeValues(params, responseTimeMs)).where(eq(requestLogs.id, logId));
    logger.debug({ logId, responseTimeMs, tokens: params.inputTokens + params.outputTokens }, 'Stream log finalized');
  } catch (error) {
    logger.error({ error, logId }, 'Failed to finalize stream log');
    if (!IS_PRODUCTION) throw error;
  }
}

export async function markStreamFailed(logId: string, error: { message: string; type?: string; statusCode?: number }): Promise<void> {
  if (!logId || logId.startsWith('temp-')) {
    logger.warn({ logId }, 'Skipping failure mark for temporary log ID');
    return;
  }
  try {
    const db = getDatabase();
    await db.update(requestLogs).set({ status: 'failure', streamStatus: 'failed', isComplete: true, errorMessage: error.message, errorType: error.type, statusCode: error.statusCode, lastUpdatedAt: new Date() }).where(eq(requestLogs.id, logId));
    logger.debug({ logId, error }, 'Stream marked as failed');
  } catch (err) {
    logger.warn({ error: err, logId }, 'Failed to mark stream as failed');
  }
}

export async function markStreamAborted(logId: string): Promise<void> {
  if (!logId || logId.startsWith('temp-')) {
    logger.warn({ logId }, 'Skipping abort mark for temporary log ID');
    return;
  }
  try {
    const db = getDatabase();
    await db.update(requestLogs).set({ status: 'failure', streamStatus: 'aborted', isComplete: true, errorMessage: 'Client disconnected', errorType: 'client_disconnect', lastUpdatedAt: new Date() }).where(eq(requestLogs.id, logId));
    logger.debug({ logId }, 'Stream marked as aborted');
  } catch (error) {
    logger.warn({ error, logId }, 'Failed to mark stream as aborted');
  }
}
