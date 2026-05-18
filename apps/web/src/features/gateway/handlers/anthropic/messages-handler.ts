import type { Context } from 'hono';

import { loadConfig } from '@/core/config';
import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';
import type { StandardRequest } from '@/types';

import { virtualModelRouter } from '../../services/access-model-router';
import { identifyClient } from '../../services/client-identifier';
import { handleGatewayError } from '../../services/error-handler';
import { logEventBus } from '../../services/log-event-bus';
import { ModelNotFoundError } from '../../services/model-group-router';
import { getProviderProtocol, getProviderUrl } from '../../services/protocol-detector';
import { handleNonStreamingResponse, handleStreamingResponse } from '../../services/response-handlers';
import { getTransformer, createTransformerContext } from '../../transformer';
import { AbortManager } from '../shared/abort-manager';
import { executeFailoverIteration } from '../shared/failover-executor';
import { AnthropicMessagesExecutor } from './messages-executor';

export async function handleAnthropicMessages(
  c: Context,
  isStreaming: boolean,
  preprocessedBody?: Record<string, unknown>,
): Promise<Response> {
  const startTime = Date.now();
  const requestId = c.get('requestId') ?? crypto.randomUUID();
  const virtualKey = c.get('virtualKey') as VirtualKey;
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';
  const requestPath = c.req.path;
  const requestMethod = c.req.method;

  const clientRequestHeaders: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => { clientRequestHeaders[key.toLowerCase()] = value; });

  const clientInfo = identifyClient(userAgent, clientRequestHeaders);
  const conversationId = c.req.header('x-conversation-id') || undefined;
  const incomingProtocol: 'anthropic' = 'anthropic';
  let retryCount = 0;

  try {
    const rawBody = (preprocessedBody ?? (await c.req.json())) as { model?: string; [key: string]: unknown };

    logger.info({ requestId, model: rawBody.model, protocol: incomingProtocol }, 'Processing Anthropic messages request');

    const ingressTransformer = getTransformer(incomingProtocol);
    if (!ingressTransformer?.normalizeRequest) throw new Error(`No transformer found for protocol: ${incomingProtocol}`);

    const ctx = createTransformerContext(requestId);
    const standardReq = await ingressTransformer.normalizeRequest(rawBody, ctx) as StandardRequest;
    const standardRequestBody = standardReq;

    if (virtualKey.allowedModels?.length && !virtualKey.allowedModels.includes(standardReq.model)) {
      return c.json({ type: 'error', error: { type: 'permission_error', message: 'Your API key does not have permission to use this model' } }, 403);
    }

    const candidates = await virtualModelRouter.routeCandidates({
      requestedModel: standardReq.model,
      streaming: standardReq.stream || false,
      hasTools: !!standardReq.tools?.length,
      hasVision: standardReq.messages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url')),
      virtualKeyId: virtualKey.id,
    });
    if (!candidates.length) throw new ModelNotFoundError(standardReq.model);

    const config = loadConfig();
    const requestGroupId = crypto.randomUUID();
    const abortManager = new AbortManager(c.req.raw.signal);
    abortManager.registerClientDisconnect();

    const req = {
      rawBody,
      standardReq,
      standardRequestBody,
      virtualKey,
      clientRequestHeaders,
      clientIp,
      userAgent,
      clientType: clientInfo.type,
      requestPath,
      requestMethod,
      conversationId,
      isStreaming,
      incomingProtocol,
      startTime,
      requestId,
    };

    try {
      for (let i = 0; i < candidates.length; i++) {
        const routeResult = candidates[i];
        const { instance, provider, group, decision, mapping, matchedRule, perf } = routeResult;
        const isLastCandidate = i === candidates.length - 1;

        if (i > 0) logger.info({ requestId, instanceId: instance.id, instanceName: instance.name, candidateIdx: i }, '[Failover] Trying next candidate instance');
        logger.debug({ requestId, originalModel: mapping.originalModel, resolvedModel: mapping.modelName, groupName: group.name, provider: provider.name, actualModel: instance.actualModelName, strategy: decision.strategy }, 'Model routed via group');

        const targetProtocol = getProviderProtocol(incomingProtocol, provider);
        const providerUrl = getProviderUrl(provider, targetProtocol);
        const isSameProtocol = incomingProtocol === targetProtocol;
        const isPassthroughEnabled = isSameProtocol && config.sameProtocolPassthrough.enabled && config.sameProtocolPassthrough.allowedProtocols.includes(incomingProtocol);

        if (!providerUrl) {
          if (!isLastCandidate) continue;
          return c.json({ type: 'error', error: { type: 'protocol_error', message: `Protocol '${targetProtocol}' not configured for provider` } }, 400);
        }

        const executor = new AnthropicMessagesExecutor({
          c, ctx, candidate: { instance, provider, group, matchedRule, mapping, decision },
          req, abortManager, providerUrl, isPassthroughEnabled, targetProtocol, retryCount,
          requestGroupId, candidateIndex: i,
        });

        const retryConfig = {
          maxRetries: instance.config?.retryConfig?.maxRetries ?? 2,
          baseDelay: instance.config?.retryConfig?.retryDelay ?? 500,
          maxDelay: 30000,
          retryableStatusCodes: instance.config?.retryConfig?.retryableStatusCodes ?? [429, 500, 502, 503, 524],
        };

        const result = await executeFailoverIteration({
          c, abortManager, isStreaming, isLastCandidate, requestId, startTime,
          getLogId: () => executor.logId, getAttemptId: () => executor.attemptId, getPreprocessEndTime: () => executor.preprocessEndTime,
          clientIp, userAgent, requestPath, requestMethod, rawBody,
          baselineTtfbP95: perf?.ttfbP95 ?? perf?.ttfbAvg ?? undefined,
          retryConfig,
          onPrepareRequest: () => executor.prepareRequest(),
          onBeforeFetch: () => executor.beforeFetch(),
          onRetry: (a, d, r) => executor.retry(a, d, r),
          onRecordFailure: () => executor.recordFailure(),
          onRecordSuccess: () => executor.recordSuccess(),
          onMarkLogAsFailed: (params) => executor.markLogFailed(params),
          onLogEventBusEmitAborted: (id) => executor.emitAbortedEvent(id),
          handleGatewayError: (code, msg) => executor.gatewayError(code, msg),
          handleProviderError: (resp, rb) => executor.providerError(resp, rb),
          handleProviderErrorPassthrough: (resp, rb) => executor.providerErrorPassthrough(resp, rb),
        });

        retryCount = result.retryCount ?? 0;

        if (result.type === 'abort') {
          return handleGatewayError({ error: new Error('Request aborted'), c, virtualKey, requestHeaders: clientRequestHeaders, providerRequestHeaders: executor.providerRequestHeaders, rawBody, clientIp, userAgent, requestPath, requestMethod, isStreaming, startTime, transformedBody: executor.transformedBody, incomingProtocol, targetProtocol, logId: executor.logId, retryCount });
        }
        if (result.type === 'failover') {
          logger.warn({ requestId, instanceId: instance.id, statusCode: result.response?.status }, '[Failover] Instance failed, switching to next candidate');
          continue;
        }
        if (result.type === 'error') return result.response!;

        const handlerParams = {
          c, response: result.response!, ctx, incomingProtocol, targetProtocol, virtualKey, provider,
          originalModelName: String(rawBody.model || 'unknown'),
          resolvedModelName: mapping.modelName,
          mappingType: mapping.mappingType,
          isMapped: mapping.isMapped,
          startTime, preprocessEndTime: executor.preprocessEndTime,
          providerTtfbTime: Date.now(),
          requestHeaders: clientRequestHeaders,
          providerRequestHeaders: executor.providerRequestHeaders,
          rawBody, standardRequestBody, transformedBody: executor.transformedBody,
          clientIp, userAgent, requestPath, requestMethod, conversationId,
          isPassthroughEnabled, clientType: clientInfo.type,
          logId: executor.logId, attemptId: executor.attemptId, retryCount, request: c.req.raw,
          routingTrace: { matchedRuleId: matchedRule?.id, matchedRuleName: matchedRule?.name, matchedRulePriority: matchedRule?.priority, modelGroupId: group.id, modelGroupName: group.name, instanceId: instance.id, actualModelName: instance.actualModelName, strategy: decision.strategy },
        };

        return standardReq.stream === true
          ? handleStreamingResponse(handlerParams)
          : handleNonStreamingResponse(handlerParams);
      }
    } finally {
      abortManager.dispose();
    }

    throw new Error('All candidate instances exhausted');
  } catch (error) {
    logger.error({ error, requestId }, 'Gateway error');
    return handleGatewayError({ error, c, virtualKey, requestHeaders: {}, clientIp, userAgent, requestPath, requestMethod, isStreaming, startTime, incomingProtocol, retryCount });
  }
}
