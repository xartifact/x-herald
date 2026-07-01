import { eq } from '@xartifact/x-llm-gateway-db';

import { IS_PRODUCTION } from '../../config/env';
import type { DbClient } from '../../db/client';
import { getDatabase } from '../../db/client';
import logger from '../../lib/logger';

// ─── x-tinker reporter (lazily initialized) ─────────────────
let xTinkerReporter: import('@xartifact/x-tinker-sdk').ErrorReporter | null = null;
function getXTinkerReporter() {
  if (xTinkerReporter) return xTinkerReporter;
  const url = process.env.X_TINKER_URL;
  if (!url) return null;
  const { ErrorReporter } = require('@xartifact/x-tinker-sdk') as typeof import('@xartifact/x-tinker-sdk');
  xTinkerReporter = new ErrorReporter({
    serverUrl: url,
    projectId: process.env.X_TINKER_PROJECT_ID || 'x-llm-gateway',
  });
  return xTinkerReporter;
}

function reportFailureToXTinker(error: Error, metadata?: Record<string, string>): void {
  getXTinkerReporter()?.report(error, 'gateway/stream', metadata).catch(() => {});
}
import type { VirtualKey } from '@xartifact/x-llm-gateway-db';
import { requestLogs, requestAttempts } from '@xartifact/x-llm-gateway-db';
import type { StreamProgress, StreamContent, LogMetadata, FailoverReason } from '../../features/logs/db';
import { costService } from '../../features/costs/service';

export interface StreamLogParams {
  virtualKey: VirtualKey;
  modelName: string;
  originalModelName?: string;
  mappingType?: 'virtual' | 'exact' | 'alias' | 'fallback' | null;
  isMapped?: boolean;
  providerId: string;
  providerName: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  clientIp?: string;
  userAgent?: string;
  clientType?: string;
  requestPath: string;
  requestMethod: string;
  incomingProtocol?: string;
  targetProtocol?: string;
  conversationId?: string;
  // Failover 链路追踪
  requestGroupId: string;
  candidateIndex: number;
  // Provider 视角（存入 requestAttempts）
  instanceId?: string;
  providerRequestHeaders?: Record<string, string>;
  transformedRequestBody?: unknown;
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

export interface LogStartResult {
  logId: string;
  attemptId: string;
}

const DB_WRITE_TIMEOUT_MS = 5_000;
function withDbTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`DB write timed out after ${DB_WRITE_TIMEOUT_MS}ms`)), DB_WRITE_TIMEOUT_MS)
    ),
  ]);
}

function buildLogInsertValues(params: StreamLogParams & { isStream: boolean }) {
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
    requestGroupId: params.requestGroupId,
    candidateIndex: params.candidateIndex,
    virtualKeyId: params.virtualKey.id,
    virtualKeyName: params.virtualKey.name,
    modelName: params.modelName,
    originalModelName: params.originalModelName,
    providerId: params.providerId,
    providerName: params.providerName,
    status: 'pending' as const,
    streamStatus,
    isComplete: false,
    statusCode: 200,
    responseTimeMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requestHeaders: params.requestHeaders as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requestBody: params.requestBody as any,
    clientIp: params.clientIp,
    userAgent: params.userAgent,
    clientType: params.clientType,
    requestPath: params.requestPath,
    requestMethod: params.requestMethod,
    streaming,
    incomingProtocol: params.incomingProtocol,
    targetProtocol: params.targetProtocol,
    conversationId: params.conversationId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: metadata as any,
    createdAt: new Date(),
    ...(params.isStream && { streamStartedAt: new Date() }),
  };
}

async function createStreamLog(params: StreamLogParams & { isStream: boolean }): Promise<LogStartResult> {
  try {
    const db = getDatabase();
    const result = await db.transaction(async (trx) => {
      const logResult = await withDbTimeout(trx.insert(requestLogs).values(buildLogInsertValues(params)).returning({ id: requestLogs.id }));
      const logId = logResult[0].id;

      const attemptResult = await withDbTimeout(trx.insert(requestAttempts).values({
        requestLogId: logId,
        requestGroupId: params.requestGroupId,
        candidateIndex: params.candidateIndex,
        instanceId: params.instanceId ?? params.routingTrace?.instanceId,
        providerId: params.providerId,
        providerName: params.providerName,
        targetProtocol: params.targetProtocol,
        status: 'pending',
        retryCount: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transformedRequestBody: params.transformedRequestBody as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        providerRequestHeaders: params.providerRequestHeaders as any,
        createdAt: new Date(),
      }).returning({ id: requestAttempts.id }));
      const attemptId = attemptResult[0].id;

      return { logId, attemptId };
    });

    logger.debug({ logId: result.logId, attemptId: result.attemptId }, 'Stream log and attempt created');
    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to create stream log');
    const tempId = 'temp-' + Date.now();
    return { logId: tempId, attemptId: tempId };
  }
}

export async function logStreamStart(params: StreamLogParams): Promise<LogStartResult> {
  const result = await createStreamLog({ ...params, isStream: true });
  const { recordClientRequestedModel } = await import('../../features/logs/services/client-model-recorder');
  await recordClientRequestedModel(params.originalModelName || params.modelName);
  return result;
}

export async function logRequestStart(params: StreamLogParams): Promise<LogStartResult> {
  return createStreamLog({ ...params, isStream: false });
}

async function createStreamLogById(
  params: StreamLogParams & { isStream: boolean },
  logId: string,
  attemptId: string,
): Promise<void> {
  const db = getDatabase();
  await db.transaction(async (trx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await withDbTimeout(trx.insert(requestLogs).values({ id: logId, ...buildLogInsertValues(params) } as any));
    await withDbTimeout(
      trx.insert(requestAttempts).values({
        id: attemptId,
        requestLogId: logId,
        requestGroupId: params.requestGroupId,
        candidateIndex: params.candidateIndex,
        instanceId: params.instanceId ?? params.routingTrace?.instanceId,
        providerId: params.providerId,
        providerName: params.providerName,
        targetProtocol: params.targetProtocol,
        status: 'pending',
        retryCount: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transformedRequestBody: params.transformedRequestBody as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        providerRequestHeaders: params.providerRequestHeaders as any,
        createdAt: new Date(),
      })
    );
  });
  logger.debug({ logId, attemptId }, 'Stream log and attempt created');
}

// 预生成 ID 并在后台异步写入 DB，从关键路径移除日志写入延迟
export function logStartAsync(params: StreamLogParams): LogStartResult {
  const logId = crypto.randomUUID();
  const attemptId = crypto.randomUUID();

  createStreamLogById({ ...params, isStream: false }, logId, attemptId)
    .catch(err => logger.error({ err, logId }, '[Log] 异步初始日志写入失败'));

  import('../../features/logs/services/client-model-recorder')
    .then(({ recordClientRequestedModel }) =>
      recordClientRequestedModel(params.originalModelName || params.modelName)
    )
    .catch(() => {});

  return { logId, attemptId };
}

export async function upgradeToStreamLog(logId: string): Promise<void> {
  if (!logId || logId.startsWith('temp-')) return;
  try {
    const db = getDatabase();
    await withDbTimeout(db.update(requestLogs).set({ streaming: 'true', streamStatus: 'streaming', streamStartedAt: new Date(), lastUpdatedAt: new Date() }).where(eq(requestLogs.id, logId)));
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
    await withDbTimeout(db.update(requestLogs).set({ streamProgress: progress as any, streamContent: partialContent as any, lastUpdatedAt: new Date() }).where(eq(requestLogs.id, logId)));
    logger.debug({ logId, chunksProcessed: progress.chunksProcessed }, 'Stream progress updated');
  } catch (error) {
    logger.warn({ error, logId }, 'Failed to update stream progress');
  }
}

export interface FinalizeStreamParams {
  attemptId: string;
  status: 'success' | 'failure';
  statusCode: number;
  startTime: number;
  inputTokens: number;
  outputTokens: number;
  usageEstimated: boolean;
  providerResponseHeaders: Record<string, string>;
  clientResponseHeaders: Record<string, string>;
  providerResponseBody: unknown;
  responseBody: unknown;
  streamContent: StreamContent;
  streamProgress: StreamProgress;
  metadata?: LogMetadata;
  toolCallsCount?: number;
  retryCount?: number;
  ttfbToFirstThinkingMs?: number;
  ttfbToFirstTextMs?: number;
  thinkingDurationMs?: number;
  providerTtfbMs?: number;
  responseTimeMs?: number;
}

function buildFinalizeValues(params: FinalizeStreamParams, responseTimeMs: number) {
  return {
    status: params.status,
    streamStatus: 'completed' as const,
    isComplete: true,
    statusCode: params.statusCode,
    responseTimeMs,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    totalTokens: params.inputTokens + params.outputTokens,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientResponseHeaders: params.clientResponseHeaders as any,
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

export async function finalizeStreamLog(logId: string, params: FinalizeStreamParams, db?: DbClient): Promise<void> {
  if (!logId || logId.startsWith('temp-')) {
    logger.warn({ logId }, 'Skipping finalization for temporary log ID');
    return;
  }

  const doFinalize = async (trx: DbClient) => {
    const responseTimeMs = Date.now() - params.startTime;
    await withDbTimeout(trx.update(requestLogs).set(buildFinalizeValues(params, responseTimeMs)).where(eq(requestLogs.id, logId)));

    if (params.attemptId && !params.attemptId.startsWith('temp-')) {
      await withDbTimeout(trx.update(requestAttempts).set({
        status: params.status,
        statusCode: params.statusCode,
        durationMs: responseTimeMs,
        ...(params.providerTtfbMs !== undefined && { ttfbMs: params.providerTtfbMs }),
        retryCount: params.retryCount ?? 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        providerResponseBody: params.providerResponseBody as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        providerResponseHeaders: params.providerResponseHeaders as any,
      }).where(eq(requestAttempts.id, params.attemptId)));
    }

    logger.debug({ logId, attemptId: params.attemptId, responseTimeMs, tokens: params.inputTokens + params.outputTokens }, 'Stream log finalized');
  };

  try {
    if (db) {
      await doFinalize(db);
    } else {
      const dbInstance = getDatabase();
      await dbInstance.transaction(async (trx) => doFinalize(trx));
    }
  } catch (error) {
    logger.error({ error, logId }, 'Failed to finalize stream log');
    if (!IS_PRODUCTION) throw error;
  }
}

export async function markStreamFailed(logId: string, attemptId: string, error: { message: string; type?: string; statusCode?: number }): Promise<void> {
  if (!logId || logId.startsWith('temp-')) {
    logger.warn({ logId }, 'Skipping failure mark for temporary log ID');
    return;
  }
  try {
    const db = getDatabase();
    await db.transaction(async (trx) => {
      await withDbTimeout(trx.update(requestLogs).set({ status: 'failure', streamStatus: 'failed', isComplete: true, errorMessage: error.message, errorType: error.type, statusCode: error.statusCode, lastUpdatedAt: new Date() }).where(eq(requestLogs.id, logId)));
      if (attemptId && !attemptId.startsWith('temp-')) {
        await withDbTimeout(trx.update(requestAttempts).set({ status: 'failure', statusCode: error.statusCode }).where(eq(requestAttempts.id, attemptId)));
      }
    });
    logger.debug({ logId, error }, 'Stream marked as failed');

    // Report stream failure to x-tinker
    const err = new Error(error.message || 'Stream failed');
    err.name = error.type || 'stream_error';
    reportFailureToXTinker(err, {
      event: 'stream_failed',
      requestId: logId,
      attemptId,
      statusCode: String(error.statusCode ?? ''),
      errorType: error.type ?? 'stream_error',
      errorMessage: error.message,
    });
  } catch (err) {
    logger.warn({ error: err, logId }, 'Failed to mark stream as failed');
  }
}

export async function markStreamAborted(logId: string, attemptId: string): Promise<void> {
  if (!logId || logId.startsWith('temp-')) {
    logger.warn({ logId }, 'Skipping abort mark for temporary log ID');
    return;
  }
  try {
    const db = getDatabase();
    await db.transaction(async (trx) => {
      await withDbTimeout(trx.update(requestLogs).set({ status: 'failure', streamStatus: 'aborted', isComplete: true, errorMessage: 'Client disconnected', errorType: 'client_disconnect', lastUpdatedAt: new Date() }).where(eq(requestLogs.id, logId)));
      if (attemptId && !attemptId.startsWith('temp-')) {
        await withDbTimeout(trx.update(requestAttempts).set({ status: 'failure' }).where(eq(requestAttempts.id, attemptId)));
      }
    });
    logger.debug({ logId }, 'Stream marked as aborted');

    // Report stream abort to x-tinker
    const err = new Error('Client disconnected');
    err.name = 'client_disconnect';
    reportFailureToXTinker(err, {
      event: 'stream_aborted',
      requestId: logId,
      attemptId,
      errorType: 'client_disconnect',
      errorMessage: 'Client disconnected',
    });
  } catch (error) {
    logger.warn({ error, logId }, 'Failed to mark stream as aborted');
  }
}

export async function markAttemptFailed(params: {
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
    await db.transaction(async (trx) => {
      await withDbTimeout(trx.update(requestLogs).set({
        status: 'failure',
        statusCode: params.statusCode,
        errorMessage: params.errorMessage,
        failoverReason: params.failoverReason,
        isComplete: true,
        streamStatus: 'failed',
        lastUpdatedAt: new Date(),
        ...(params.retryCount !== undefined && { retryCount: params.retryCount }),
        ...(params.responseTimeMs !== undefined && { responseTimeMs: params.responseTimeMs }),
      }).where(eq(requestLogs.id, logId)));

      if (attemptId && !attemptId.startsWith('temp-')) {
        await withDbTimeout(trx.update(requestAttempts).set({
          status: 'failure',
          statusCode: params.statusCode,
          failoverReason: params.failoverReason,
          retryCount: params.retryCount ?? 0,
          ...(params.responseTimeMs !== undefined && { durationMs: params.responseTimeMs }),
          ...(params.providerTtfbMs !== undefined && { ttfbMs: params.providerTtfbMs }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(params.providerResponseBody !== undefined && { providerResponseBody: params.providerResponseBody as any }),
        }).where(eq(requestAttempts.id, attemptId)));
      }
    });

    logger.debug({ logId, attemptId, statusCode: params.statusCode, failoverReason: params.failoverReason }, 'Attempt marked as failed');

    // Report attempt failure to x-tinker
    const err = new Error(params.errorMessage || 'Attempt failed');
    err.name = 'attempt_error';
    reportFailureToXTinker(err, {
      event: 'attempt_failed',
      requestId: logId,
      attemptId,
      statusCode: String(params.statusCode),
      errorType: 'attempt_error',
      errorMessage: params.errorMessage,
      failoverReason: params.failoverReason ?? '',
      retryCount: String(params.retryCount ?? 0),
      responseTimeMs: params.responseTimeMs != null ? String(params.responseTimeMs) : '',
      providerTtfbMs: params.providerTtfbMs != null ? String(params.providerTtfbMs) : '',
    });
  } catch (error) {
    logger.warn({ error, logId }, 'Failed to mark attempt as failed');
  }
}
