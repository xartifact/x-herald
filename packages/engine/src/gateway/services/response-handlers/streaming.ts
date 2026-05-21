import logger from '../../../lib/logger';

import { getTransformer } from '../../transformer';
import { logEventBus } from '../log-event-bus';
import {
  upgradeToStreamLog,
  finalizeStreamLog as finalizeStreamLogRecord,
  markStreamFailed,
  markStreamAborted,
} from '../log-service';
import { extractMetadata } from '../metadata-extractor';
import type { ResponseHandlerParams } from './params';
import {
  StreamResponseCollector,
  createModelRemapStream,
  extractProviderResponseHeaders,
  getClientStreamingHeaders,
  mergeResponseHeaders,
} from './shared';

interface StreamTimings {
  ttfbToFirstThinkingMs?: number
  ttfbToFirstTextMs?: number
  thinkingDurationMs?: number
}

function buildStreamTimings(providerTtfbTime: number, collector: StreamResponseCollector): StreamTimings {
  const { firstThinkingChunkTime, firstTextChunkTime } = collector.getFirstChunkTimes();
  return {
    ttfbToFirstThinkingMs: firstThinkingChunkTime != null && providerTtfbTime > 0 ? firstThinkingChunkTime - providerTtfbTime : undefined,
    ttfbToFirstTextMs: firstTextChunkTime != null && providerTtfbTime > 0 ? firstTextChunkTime - providerTtfbTime : undefined,
    thinkingDurationMs: firstThinkingChunkTime != null && firstTextChunkTime != null ? firstTextChunkTime - firstThinkingChunkTime : undefined,
  };
}

interface FinalizeContext {
  logId: string
  attemptId: string
  clientCollector: StreamResponseCollector
  providerCollector: StreamResponseCollector
  standardCollector: StreamResponseCollector
  needsTransformation: boolean
  startTime: number
  preprocessEndTime: number
  providerTtfbTime: number
  mergedHeaders: Record<string, string>
  providerResponseHeaders: Record<string, string>
  params: ResponseHandlerParams
  targetProtocol: string
  incomingProtocol: string
}

async function finalizeStreamWithLog(ctx: FinalizeContext, status: 'success' | 'failure'): Promise<void> {
  const { logId, attemptId, clientCollector, providerCollector, standardCollector, needsTransformation, startTime, preprocessEndTime, providerTtfbTime, mergedHeaders, providerResponseHeaders, params, targetProtocol, incomingProtocol } = ctx;
  const usage = clientCollector.getUsage();
  const fullContent = clientCollector.getFullContent();
  const providerProgress = providerCollector.getProgress();
  const progress = { ...clientCollector.getProgress(), lastChunkAt: providerProgress.lastChunkAt };
  const now = Date.now();
  const timings = buildStreamTimings(providerTtfbTime, clientCollector);
  const responseContent = needsTransformation ? standardCollector.getFullContent() : providerCollector.getFullContent();

  const metadata = extractMetadata({
    requestBody: params.rawBody,
    standardRequestBody: params.standardRequestBody,
    standardResponseBody: responseContent,
    responseBody: fullContent,
    responseTimeMs: now - startTime,
    gatewayOverheadMs: preprocessEndTime - startTime,
    providerTtfbMs: providerTtfbTime - preprocessEndTime,
    streamDurationMs: now - providerTtfbTime,
    conversationId: params.conversationId,
  });

  if (params.routingTrace || params.originalModelName) {
    metadata.routing = {
      requestedModel: params.originalModelName,
      ...params.routingTrace,
      responseModelName: providerCollector.getProviderModel() ?? params.routingTrace?.responseModelName,
    };
  }

  await finalizeStreamLogRecord(logId, {
    attemptId,
    status,
    statusCode: status === 'success' ? 200 : 500,
    startTime,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    usageEstimated: usage.estimated,
    providerTtfbMs: providerTtfbTime > 0 ? providerTtfbTime - preprocessEndTime : undefined,
    providerResponseHeaders,
    clientResponseHeaders: mergedHeaders,
    providerResponseBody: { ...(providerCollector.getSummary(targetProtocol) as Record<string, unknown>), streamContent: providerCollector.getFullContent(), streamProgress: providerCollector.getProgress() },
    responseBody: { ...(clientCollector.getSummary(incomingProtocol) as Record<string, unknown>), streamContent: fullContent, streamProgress: progress },
    streamContent: fullContent,
    streamProgress: progress,
    metadata,
    toolCallsCount: metadata.toolCalls?.tools?.length,
    retryCount: params.retryCount,
    ...timings,
  });

  logEventBus.emitLog({ event: 'completed', logId, status, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, responseTimeMs: now - startTime, thinkingDurationMs: timings.thinkingDurationMs });
}

export async function handleStreamingResponse(params: ResponseHandlerParams): Promise<Response> {
  const { response, ctx, provider, originalModelName, resolvedModelName, isMapped, startTime, preprocessEndTime, providerTtfbTime, incomingProtocol, targetProtocol } = params;

  const logId = params.logId || 'temp-' + Date.now();
  const attemptId = params.attemptId || 'temp-' + Date.now();
  await upgradeToStreamLog(logId);

  logEventBus.emitLog({ event: 'started', logId, modelName: resolvedModelName || originalModelName || 'unknown', originalModelName: originalModelName ?? undefined, providerName: provider.name, virtualKeyName: params.virtualKey.name ?? undefined, startTime, incomingProtocol });

  const providerCollector = new StreamResponseCollector();
  const standardCollector = new StreamResponseCollector();
  const clientCollector = new StreamResponseCollector();
  let chunkEmitCount = 0;
  let lastChunkEmitTime = Date.now();

  const providerResponseHeaders = extractProviderResponseHeaders(response);
  const clientResponseHeaders = getClientStreamingHeaders(providerResponseHeaders['content-type']);
  const needsTransformation = targetProtocol !== incomingProtocol && !params.isPassthroughEnabled;

  const makeCollectorTransform = (collector: StreamResponseCollector) => new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      for (const line of text.split('\n')) {
        if (line.startsWith('data:')) { const d = line.slice(5).trim(); if (d !== '[DONE]') collector.processEvent(d); }
      }
      controller.enqueue(chunk);
    },
  });

  // Use ReadableStream<Uint8Array> (base type) to avoid ArrayBuffer vs ArrayBufferLike variance
  let transformedStream: ReadableStream<Uint8Array> | null = response.body as ReadableStream<Uint8Array> | null;
  if (needsTransformation && transformedStream) {
    transformedStream = transformedStream.pipeThrough(makeCollectorTransform(providerCollector));
    ctx.state.set('streamDirection', 'normalize');
    const ingressTransformer = getTransformer(targetProtocol);
    if (ingressTransformer?.transformStream) {
      transformedStream = await ingressTransformer.transformStream(transformedStream, ctx) as ReadableStream<Uint8Array>;
    } else {
      logger.warn({ protocol: targetProtocol }, 'No stream normalizer available, skipping ingress transformation');
    }
    transformedStream = transformedStream.pipeThrough(makeCollectorTransform(standardCollector));
    ctx.state.set('streamDirection', 'adapt');
    const egressTransformer = getTransformer(incomingProtocol);
    if (egressTransformer?.transformStream) {
      transformedStream = await egressTransformer.transformStream(transformedStream, ctx) as ReadableStream<Uint8Array>;
    } else {
      logger.warn({ protocol: incomingProtocol }, 'No stream adapter available, skipping egress transformation');
    }
  } else if (transformedStream) {
    transformedStream = transformedStream.pipeThrough(makeCollectorTransform(providerCollector));
  }

  const mergedHeaders = mergeResponseHeaders(clientResponseHeaders, providerResponseHeaders);
  let isLogFinalized = false;
  const finalizeCtx: FinalizeContext = { logId, attemptId, clientCollector, providerCollector, standardCollector, needsTransformation, startTime, preprocessEndTime, providerTtfbTime, mergedHeaders, providerResponseHeaders, params, targetProtocol, incomingProtocol };

  const finalizeLog = async (status: 'success' | 'failure' = 'success') => {
    if (isLogFinalized) return;
    isLogFinalized = true;
    try {
      await finalizeStreamWithLog(finalizeCtx, status);
    } catch (error) {
      logger.error({ error, logId }, 'Failed to finalize stream log');
      await markStreamFailed(logId, attemptId, { message: error instanceof Error ? error.message : 'Unknown error', type: 'log_finalization_error' });
    }
  };

  const STREAM_IDLE_TIMEOUT_MS = 120000;
  let streamIdleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetStreamIdleTimer = (controller: TransformStreamDefaultController<Uint8Array>) => {
    if (streamIdleTimer) clearTimeout(streamIdleTimer);
    streamIdleTimer = setTimeout(() => { logger.warn({ logId }, `Stream idle timeout after ${STREAM_IDLE_TIMEOUT_MS / 1000}s, terminating`); controller.terminate(); finalizeLog('failure').catch(() => {}); }, STREAM_IDLE_TIMEOUT_MS);
  };

  const usageExtractor = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      resetStreamIdleTimer(controller);
      const text = new TextDecoder().decode(chunk);
      for (const line of text.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        clientCollector.processEvent(data);
        chunkEmitCount++;
        const nowEmit = Date.now();
        if (chunkEmitCount % 10 === 0 || nowEmit - lastChunkEmitTime >= 500) {
          const usage = clientCollector.getUsage();
          const fullContent = clientCollector.getFullContent();
          logEventBus.emitLog({ event: 'chunk', logId, outputTokens: usage.outputTokens, totalChunks: chunkEmitCount, hasThinking: fullContent.thinkingBlocks.length > 0, elapsedMs: nowEmit - startTime });
          lastChunkEmitTime = nowEmit;
        }
      }
      controller.enqueue(chunk);
    },
    async flush() { if (streamIdleTimer) clearTimeout(streamIdleTimer); await finalizeLog('success'); },
  });

  if (isMapped && originalModelName && transformedStream) {
    transformedStream = transformedStream.pipeThrough(createModelRemapStream(originalModelName)) as unknown as ReadableStream<Uint8Array<ArrayBuffer>>;
  }

  const finalStream = transformedStream?.pipeThrough(usageExtractor);

  if (params.request?.signal) {
    params.request.signal.addEventListener('abort', async () => {
      logger.info({ logId }, 'Client disconnected, finalizing stream log');
      if (streamIdleTimer) clearTimeout(streamIdleTimer);
      await finalizeLog('failure');
      await markStreamAborted(logId, attemptId);
      logEventBus.emitLog({ event: 'aborted', logId });
    }, { once: true });
  }

  return new Response(finalStream, { headers: mergedHeaders });
}
