import type { Context } from 'hono'

import type { VirtualKey } from '@xartifact/x-herald-db'

import logger from '../../../lib/logger'
import { accessModelRouter } from '../../services/access-model-router'
import { identifyClient, resolveClientIp } from '../../services/client-identifier'
import { handleGatewayError } from '../../services/error-handler'
import { markStreamAborted } from '../../services/log-service'
import { ModelNotFoundError } from '../../services/model-group-router'
import { getProviderUrl } from '../../services/protocol-detector'
import { handleNonStreamingResponse } from '../../services/response-handlers'
import type { ResponseHandlerParams } from '../../services/response-handlers/params'
import { createTransformerContext } from '../../transformer'
import { PassthroughCandidateExecutor } from '../openai/embedding-executor'
import { AbortManager } from '../shared/abort-manager'
import { executeFailoverIteration } from '../shared/failover-executor'

const JEV_PROTOCOL = 'jev'
const JEV_CATEGORY = 'system_one'
const JEV_ENDPOINT = '/v1/systemone'

/**
 * Transparently proxies JEV System One requests. The client-supplied `model` is
 * used for gateway routing and is replaced with the selected instance model
 * before forwarding to the provider.
 */
export async function handleJevSystemOne(
  c: Context,
  preprocessedBody?: Record<string, unknown>,
): Promise<Response> {
  const startTime = Date.now()
  const requestId = c.get('requestId') ?? crypto.randomUUID()
  const virtualKey = c.get('virtualKey') as VirtualKey
  const clientIp = resolveClientIp(c)
  const userAgent = c.req.header('user-agent') || 'unknown'
  const requestPath = c.req.path
  const requestMethod = c.req.method
  const clientRequestHeaders: Record<string, string> = {}
  c.req.raw.headers.forEach((value, key) => {
    clientRequestHeaders[key.toLowerCase()] = value
  })
  const clientInfo = identifyClient(userAgent, clientRequestHeaders)
  let retryCount = 0

  try {
    const rawBody =
      (preprocessedBody as { model?: string; [key: string]: unknown }) ??
      ((await c.req.json()) as { model?: string; [key: string]: unknown })
    const model = rawBody.model
    if (typeof model !== 'string' || !model) {
      return c.json({ error: { type: 'invalid_request_error', message: 'Missing model' } }, 400)
    }
    if (virtualKey.allowedModels?.length && !virtualKey.allowedModels.includes(model)) {
      return c.json(
        {
          error: {
            type: 'invalid_request_error',
            message: `Model "${model}" is not allowed for this API key`,
          },
        },
        403,
      )
    }

    const requestGroupId = crypto.randomUUID()
    const candidates = await accessModelRouter.routeCandidates({
      requestedModel: model,
      streaming: false,
      hasTools: false,
      hasVision: false,
      virtualKeyId: virtualKey.id,
      requestGroupId,
    })
    const jevCandidates = candidates.filter(
      (candidate) => candidate.group.category === JEV_CATEGORY,
    )
    if (jevCandidates.length === 0) throw new ModelNotFoundError(model)

    const abortManager = new AbortManager(c.req.raw.signal)
    abortManager.registerClientDisconnect()
    const req = {
      rawBody,
      virtualKey,
      clientRequestHeaders,
      clientIp,
      userAgent,
      clientType: clientInfo.type,
      requestPath,
      requestMethod,
      isStreaming: false,
      incomingProtocol: JEV_PROTOCOL,
      startTime,
      requestId,
    }

    try {
      for (let index = 0; index < jevCandidates.length; index++) {
        const routeResult = jevCandidates[index]
        const { instance, provider, group, decision, mapping } = routeResult
        const isLastCandidate = index === jevCandidates.length - 1
        const providerUrl = getProviderUrl(provider, JEV_PROTOCOL)
        if (!providerUrl) {
          if (!isLastCandidate) continue
          return c.json(
            {
              error: {
                type: 'protocol_error',
                message: `Protocol '${JEV_PROTOCOL}' not configured for provider`,
              },
            },
            400,
          )
        }

        const executor = new PassthroughCandidateExecutor({
          c,
          candidate: {
            instance,
            provider,
            group,
            matchedRule: routeResult.matchedRule,
            mapping,
            decision,
          },
          req,
          abortManager,
          providerUrl,
          endpoint: JEV_ENDPOINT,
          targetProtocol: JEV_PROTOCOL,
          retryCount,
          requestGroupId,
          candidateIndex: index,
        })
        const retryConfig = {
          maxRetries: instance.config?.retryConfig?.maxRetries ?? 2,
          baseDelay: instance.config?.retryConfig?.retryDelay ?? 500,
          maxDelay: 30_000,
          retryableStatusCodes: instance.config?.retryConfig?.retryableStatusCodes ?? [
            429, 500, 502, 503, 504, 521, 524,
          ],
        }
        const result = await executeFailoverIteration({
          c,
          abortManager,
          isStreaming: false,
          isLastCandidate,
          requestId,
          providerName: provider.name,
          instanceName: instance.name,
          modelName: instance.actualModelName,
          startTime,
          getLogId: () => executor.logId,
          getAttemptId: () => executor.attemptId,
          getPreprocessEndTime: () => executor.preprocessEndTime,
          clientIp,
          userAgent,
          requestPath,
          requestMethod,
          rawBody,
          retryConfig,
          logFailoverAttempts: instance.config?.logFailoverAttempts ?? true,
          onPrepareRequest: () => executor.prepareRequest(),
          onBeforeFetch: () => executor.beforeFetch(),
          onRetry: (attempt, delay, response) => executor.retry(attempt, delay, response),
          onRecordFailure: () => executor.recordFailure(),
          onRecordSuccess: () => executor.recordSuccess(),
          onMarkLogAsFailed: (params) => executor.markLogFailed(params),
          onLogEventBusEmitAborted: (id) => executor.emitAbortedEvent(id),
          handleGatewayError: (code, message) => executor.gatewayError(code, message),
          handleProviderError: (response, body) => executor.providerError(response, body),
          handleProviderErrorPassthrough: (response, body) =>
            executor.providerErrorPassthrough(response, body),
        })
        retryCount = result.retryCount ?? 0
        if (result.type === 'abort') {
          if (result.aborted === 'client_disconnect') {
            if (executor.logId) {
              await markStreamAborted(executor.logId, executor.attemptId ?? '', false, {
                forceCancelled: true,
              })
            }
            return new Response(null, { status: 499 })
          }
          return handleGatewayError({
            error: new Error('Request aborted'),
            c,
            virtualKey,
            requestHeaders: clientRequestHeaders,
            providerRequestHeaders: executor.providerRequestHeaders,
            rawBody,
            clientIp,
            userAgent,
            clientType: clientInfo.type,
            requestPath,
            requestMethod,
            isStreaming: false,
            startTime,
            transformedBody: executor.transformedBody,
            incomingProtocol: JEV_PROTOCOL,
            targetProtocol: JEV_PROTOCOL,
            logId: executor.logId,
            retryCount,
          })
        }
        if (result.type === 'failover') continue
        if (result.type === 'error') return result.response!

        const responseParams: ResponseHandlerParams = {
          c,
          response: result.response!,
          ctx: createTransformerContext(requestId),
          incomingProtocol: JEV_PROTOCOL,
          targetProtocol: JEV_PROTOCOL,
          virtualKey,
          provider,
          originalModelName: model,
          resolvedModelName: mapping.modelName,
          mappingType: mapping.mappingType,
          isMapped: mapping.isMapped,
          startTime,
          preprocessEndTime: executor.preprocessEndTime,
          providerTtfbTime: Date.now(),
          requestHeaders: clientRequestHeaders,
          providerRequestHeaders: executor.providerRequestHeaders,
          rawBody,
          transformedBody: executor.transformedBody,
          clientIp,
          userAgent,
          requestPath,
          requestMethod,
          isPassthroughEnabled: true,
          clientType: clientInfo.type,
          logId: executor.logId,
          attemptId: executor.attemptId,
          retryCount,
          routingTrace: {
            matchedRuleId: routeResult.matchedRule?.id,
            matchedRuleName: routeResult.matchedRule?.name,
            matchedRulePriority: routeResult.matchedRule?.priority,
            modelGroupId: group.id,
            modelGroupName: group.name,
            instanceId: instance.id,
            actualModelName: instance.actualModelName,
            strategy: decision.strategy,
            instanceCost: instance.costPer1kTokens,
          },
        }
        return handleNonStreamingResponse(responseParams)
      }
    } finally {
      abortManager.dispose()
    }

    throw new Error('All JEV candidate instances exhausted')
  } catch (error) {
    logger.error({ error, requestId }, 'JEV System One gateway error')
    return handleGatewayError({
      error: error instanceof Error ? error : new Error(String(error)),
      c,
      virtualKey,
      requestHeaders: clientRequestHeaders,
      clientIp,
      userAgent,
      clientType: clientInfo.type,
      requestPath,
      requestMethod,
      isStreaming: false,
      startTime,
      incomingProtocol: JEV_PROTOCOL,
      targetProtocol: JEV_PROTOCOL,
      logId: undefined,
      retryCount,
    })
  }
}
