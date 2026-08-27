import type { Context } from 'hono'

import { loadConfig } from '../../../config'
import logger from '../../../lib/logger'
import type { VirtualKey } from '@xartifact/x-herald-db'
import type { ModelGroup, ModelInstance } from '@xartifact/x-herald-db'
import type { providers } from '@xartifact/x-herald-db'
import type { StandardRequest, TransformerContext } from '@xartifact/x-herald-shared'

import { accessModelRouter } from '../../services/access-model-router'
import { identifyClient, resolveClientIp } from '../../services/client-identifier'
import {
  handleGatewayError,
  handleProviderError,
  handleProviderErrorPassthrough,
} from '../../services/error-handler'
import { shouldFilterHeader } from '../../services/headers'
import { logStartAsync } from '../../services/log-service'
import type { ModelMappingResult } from '../../services/model-mapping'
import { buildRouteChainSnapshot } from '../../services/routing-trace-recorder'
import { ModelNotFoundError } from '../../services/model-group-router'
import { getProviderProtocol, getProviderUrl, getEndpoint } from '../../services/protocol-detector'
import {
  handleNonStreamingResponse,
  handleStreamingResponse,
} from '../../services/response-handlers'
import { getTransformer, createTransformerContext } from '../../transformer'
import { buildHeaders } from '../../transformer/shared/parameter-transformer'
import { sanitizeOpenAIToolsArray } from '../../transformer/shared/tool-schema-sanitizer'
import { AbortManager } from '../shared/abort-manager'
import {
  calculateTtfbTimeout,
  resolveConnectTimeoutMs,
  resolveInstanceAttemptTimeoutMs,
} from '../shared/constants'
import { joinUrl } from '../shared/join-url'
import { executeWithRetry, type RetryConfig } from '../shared/retry-executor'
import {
  getTtfbTimeoutConfig,
  refreshTtfbConfigIfStale,
  resolveAttemptBaseMs,
  resolveTotalLimitMs,
} from '../../services/ttfb-timeout-policy'
import {
  convertChatToResponsesBody,
  convertResponsesToChatFormat,
  convertStreamToResponsesFormat,
} from './responses-format'

interface ProviderRequest {
  transformedBody: unknown
  targetUrl: string
  requestBody: string
  providerRequestHeaders: Record<string, string>
}

interface CandidateInfo {
  instance: ModelInstance
  provider: typeof providers.$inferSelect
  group: ModelGroup
  matchedRule?: { id: string; name: string; priority: number }
  mapping: ModelMappingResult
  decision: { strategy: string }
}

async function buildProviderRequest(opts: {
  isPassthroughEnabled: boolean
  rawBody: Record<string, unknown>
  instance: ModelInstance
  provider: typeof providers.$inferSelect
  clientRequestHeaders: Record<string, string>
  standardReq: StandardRequest
  ctx: TransformerContext
  targetProtocol: 'openai' | 'anthropic'
  isStreaming: boolean
  providerUrl: string
}): Promise<ProviderRequest> {
  const {
    isPassthroughEnabled,
    rawBody,
    instance,
    provider,
    clientRequestHeaders,
    standardReq,
    ctx,
    targetProtocol,
    isStreaming,
    providerUrl,
  } = opts
  const filtered = Object.fromEntries(
    Object.entries(clientRequestHeaders).filter(([k]) => !shouldFilterHeader(k)),
  )

  if (isPassthroughEnabled) {
    const transformedBody: { model?: string; tools?: unknown; [key: string]: unknown } = {
      ...rawBody,
      model: instance.actualModelName,
    }
    if (
      provider.protocols?.openai?.toolSchemaSanitization &&
      Array.isArray(transformedBody.tools)
    ) {
      transformedBody.tools = sanitizeOpenAIToolsArray(transformedBody.tools)
    }
    return {
      transformedBody,
      targetUrl: joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming)),
      requestBody: JSON.stringify(transformedBody),
      providerRequestHeaders: { ...filtered, authorization: `Bearer ${provider.apiKey}` },
    }
  }

  const egressTransformer = getTransformer(targetProtocol)
  if (!egressTransformer?.adaptRequest)
    throw new Error(`No adapter found for protocol: ${targetProtocol}`)
  const adapted = await egressTransformer.adaptRequest(standardReq, ctx)
  let pHeaders: Record<string, string> = {
    ...filtered,
    ...Object.fromEntries(
      Object.entries(adapted.headers || {}).map(([k, v]) => [k.toLowerCase(), v]),
    ),
    authorization: `Bearer ${provider.apiKey}`,
  }
  if ((ctx.instanceConfig as Record<string, unknown>)?.customHeaders)
    pHeaders = buildHeaders(
      pHeaders,
      (ctx.instanceConfig as Record<string, unknown>).customHeaders as Record<string, string>,
      ctx,
    )
  return {
    transformedBody: adapted.body,
    targetUrl: adapted.url || joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming)),
    requestBody: JSON.stringify(adapted.body),
    providerRequestHeaders: pHeaders,
  }
}

function buildLogParams(opts: {
  candidate: CandidateInfo
  clientRequestHeaders: Record<string, string>
  responsesBody: unknown
  standardRequestBody: StandardRequest
  providerRequestHeaders: Record<string, string>
  transformedBody: unknown
  clientIp: string
  userAgent: string
  clientType?: string
  requestPath: string
  requestMethod: string
  incomingProtocol: 'openai'
  targetProtocol: 'openai' | 'anthropic'
  conversationId?: string
  virtualKey: VirtualKey
}) {
  const {
    candidate,
    clientRequestHeaders,
    responsesBody,
    providerRequestHeaders,
    transformedBody,
    clientIp,
    userAgent,
    clientType,
    requestPath,
    requestMethod,
    incomingProtocol,
    targetProtocol,
    conversationId,
    virtualKey,
  } = opts
  const { instance, provider, group, matchedRule, mapping, decision } = candidate
  return {
    virtualKey,
    modelName: mapping.modelName,
    originalModelName: mapping.originalModel,
    mappingType: mapping.mappingType,
    isMapped: mapping.isMapped,
    providerId: provider.id,
    providerName: provider.name,
    requestHeaders: clientRequestHeaders,
    providerRequestHeaders,
    requestBody: responsesBody,
    transformedRequestBody: transformedBody,
    clientIp,
    userAgent,
    clientType,
    requestPath,
    requestMethod,
    incomingProtocol,
    targetProtocol,
    conversationId,
    instanceId: instance.id,
    routingTrace: {
      matchedRuleId: matchedRule?.id,
      matchedRuleName: matchedRule?.name,
      matchedRulePriority: matchedRule?.priority,
      modelGroupId: group.id,
      modelGroupName: group.name,
      instanceId: instance.id,
      actualModelName: instance.actualModelName,
      strategy: decision.strategy,
      instanceCost: instance.costPer1kTokens,
    },
  }
}

export async function handleResponsesAPI(
  c: Context,
  isStreaming: boolean,
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
  const clientType = clientInfo.type
  const conversationId = c.req.header('x-conversation-id') || undefined

  let rawBody: { model?: string; [key: string]: unknown } | undefined
  let transformedBody: unknown
  const incomingProtocol = 'openai' as const
  let targetProtocol: 'openai' | 'anthropic' | undefined
  let providerRequestHeaders: Record<string, string> | undefined
  let logId: string | undefined
  let attemptId: string | undefined
  const requestGroupId = crypto.randomUUID()
  let retryCount = 0

  try {
    const responsesBody = preprocessedBody ?? ((await c.req.json()) as Record<string, unknown>)
    rawBody = convertResponsesToChatFormat(responsesBody) as {
      model?: string
      [key: string]: unknown
    }
    logger.info(
      { requestId, model: rawBody.model, protocol: incomingProtocol },
      'Processing Responses API request',
    )

    const ingressTransformer = getTransformer(incomingProtocol)
    if (!ingressTransformer?.normalizeRequest)
      throw new Error(`No transformer found for protocol: ${incomingProtocol}`)

    const ctx = createTransformerContext(requestId)
    const standardReq = await ingressTransformer.normalizeRequest(rawBody, ctx)
    const standardRequestBody = standardReq

    if (virtualKey.allowedModels?.length && !virtualKey.allowedModels.includes(standardReq.model)) {
      return c.json(
        {
          error: {
            type: 'permission_error',
            message: 'Your API key does not have permission to use this model',
          },
        },
        403,
      )
    }

    const routeResult = await accessModelRouter.route({
      requestedModel: standardReq.model,
      streaming: standardReq.stream || false,
      hasTools: !!standardReq.tools?.length,
      request: standardReq,
      hasVision: standardReq.messages.some(
        (m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'image_url'),
      ),
      virtualKeyId: virtualKey.id,
    })
    if (!routeResult) throw new ModelNotFoundError(standardReq.model)

    const routeChain = buildRouteChainSnapshot(
      [routeResult],
      standardReq.model,
      undefined,
      routeResult.matchedRule
        ? {
            id: routeResult.matchedRule.id,
            name: routeResult.matchedRule.name,
            priority: routeResult.matchedRule.priority,
            conditions: routeResult.matchedRule.conditions,
          }
        : undefined,
    )

    const { instance, provider, group, decision, mapping, matchedRule } = routeResult
    logger.debug(
      {
        requestId,
        originalModel: mapping.originalModel,
        resolvedModel: mapping.modelName,
        groupName: group.name,
        provider: provider.name,
        actualModel: instance.actualModelName,
        strategy: decision.strategy,
        instanceCost: instance.costPer1kTokens,
      },
      'Model routed via group',
    )

    targetProtocol = getProviderProtocol(incomingProtocol, provider)
    const providerUrl = getProviderUrl(provider, targetProtocol)
    if (!providerUrl)
      return c.json(
        {
          error: {
            type: 'protocol_error',
            message: `Protocol '${targetProtocol}' not configured for provider`,
          },
        },
        400,
      )

    const config = loadConfig()
    const isSameProtocol = incomingProtocol === targetProtocol
    const isPassthroughEnabled =
      isSameProtocol &&
      config.sameProtocolPassthrough.enabled &&
      config.sameProtocolPassthrough.allowedProtocols.includes(incomingProtocol)

    standardReq.model = instance.actualModelName
    ctx.provider = {
      name: provider.name,
      baseUrl: providerUrl,
      apiKey: provider.apiKey || '',
      protocol: targetProtocol,
      models: [],
      protocols: provider.protocols as Record<string, { baseUrl: string; enabled: boolean }>,
    }
    ctx.instanceConfig = (instance.config ?? undefined) as Record<string, unknown> | undefined

    const candidate: CandidateInfo = { instance, provider, group, matchedRule, mapping, decision }
    const providerReq = await buildProviderRequest({
      isPassthroughEnabled,
      rawBody,
      instance,
      provider,
      clientRequestHeaders,
      standardReq,
      ctx,
      targetProtocol,
      isStreaming,
      providerUrl,
    })
    transformedBody = providerReq.transformedBody
    providerRequestHeaders = providerReq.providerRequestHeaders

    logger.debug(
      {
        requestId,
        targetUrl: providerReq.targetUrl,
        targetProtocol,
        model: standardReq.model,
        isPassthrough: isPassthroughEnabled,
      },
      'Forwarding to provider',
    )

    ;({ logId, attemptId } = logStartAsync({
      ...buildLogParams({
        candidate,
        clientRequestHeaders,
        responsesBody,
        standardRequestBody,
        providerRequestHeaders,
        transformedBody,
        clientIp,
        userAgent,
        clientType,
        requestPath,
        requestMethod,
        incomingProtocol,
        targetProtocol,
        conversationId,
        virtualKey,
      }),
      requestGroupId,
      candidateIndex: 0,
    }))
    const preprocessEndTime = Date.now()

    const retryConfig: RetryConfig = {
      maxRetries: instance.config?.retryConfig?.maxRetries ?? 2,
      baseDelay: instance.config?.retryConfig?.retryDelay ?? 500,
      maxDelay: 30000,
      retryableStatusCodes: instance.config?.retryConfig?.retryableStatusCodes ?? [
        429, 500, 502, 503, 504, 521, 524,
      ],
    }

    const abortManager = new AbortManager(c.req.raw.signal)
    abortManager.registerClientDisconnect()

    await refreshTtfbConfigIfStale()
    const ttfbCfg = getTtfbTimeoutConfig()
    const totalLimit = resolveTotalLimitMs(isStreaming, ttfbCfg)
    const elapsed = Date.now() - startTime
    const remainingBudget = Math.max(0, totalLimit - elapsed)
    const instanceTimeout = instance.config?.timeoutConfig ?? null
    const connectTimeout = resolveConnectTimeoutMs(instanceTimeout)
    const configuredTimeout =
      resolveInstanceAttemptTimeoutMs(instanceTimeout) ?? resolveAttemptBaseMs(isStreaming, ttfbCfg)
    const ttfbTimeout = calculateTtfbTimeout({
      configuredTimeout,
      remainingBudget,
      minAttemptMs: ttfbCfg.minAttemptMs,
      baselineMultiplier: ttfbCfg.baselineMultiplier,
    })

    let response: Response | undefined
    let providerTtfbTime = 0
    try {
      const retryResult = await executeWithRetry({
        abortManager,
        operation: async (signal) =>
          fetch(providerReq.targetUrl, {
            method: 'POST',
            headers: providerRequestHeaders,
            body: providerReq.requestBody,
            signal,
            connectTimeout,
          } as RequestInit),
        timeout: ttfbTimeout,
        requestId,
        isStreaming,
        config: retryConfig,
        onRetry: (attempt, delay, lastResponse) => {
          logger.info(
            { requestId, attempt, statusCode: lastResponse?.status, retryDelay: delay },
            '[Retry] Retrying upstream request',
          )
        },
      })

      providerTtfbTime = Date.now()
      const { response: rawResponse, retryCount: finalRetryCount } = retryResult
      retryCount = finalRetryCount

      if (retryResult.aborted || !rawResponse) {
        const abortMessage =
          retryResult.aborted === 'client_disconnect'
            ? 'Client disconnected'
            : retryResult.aborted === 'timeout'
              ? `Request TTFB timeout after ${Math.round(ttfbTimeout / 1000)}s (limit=${ttfbTimeout}ms, totalBudget=${totalLimit}ms)`
              : 'Client disconnected'
        return handleGatewayError({
          error: new Error(abortMessage),
          c,
          virtualKey,
          requestHeaders: clientRequestHeaders,
          providerRequestHeaders,
          rawBody,
          clientIp,
          userAgent,
          requestPath,
          requestMethod,
          isStreaming,
          startTime,
          transformedBody,
          incomingProtocol,
          targetProtocol,
          logId,
          retryCount,
        })
      }
      response = rawResponse
    } finally {
      abortManager.dispose()
    }

    const upstreamResponse = response!
    if (!upstreamResponse.ok) {
      if (retryCount > 0)
        logger.info(
          { requestId, retryCount, statusCode: upstreamResponse.status },
          '[Retry] All retries exhausted',
        )
      const errorHandler = isPassthroughEnabled
        ? handleProviderErrorPassthrough
        : handleProviderError
      return errorHandler({
        c,
        response: upstreamResponse,
        provider,
        virtualKey,
        originalModelName: rawBody.model || 'unknown',
        requestHeaders: clientRequestHeaders,
        providerRequestHeaders,
        rawBody,
        clientIp,
        userAgent,
        requestPath,
        requestMethod,
        isStreaming,
        startTime,
        transformedBody,
        incomingProtocol,
        targetProtocol,
        logId,
        attemptId,
        retryCount,
        routingTrace: routeChain,
      })
    }

    const handlerParams = {
      c,
      response: upstreamResponse,
      ctx,
      incomingProtocol,
      targetProtocol,
      virtualKey,
      provider,
      originalModelName: rawBody.model || 'unknown',
      resolvedModelName: mapping.modelName,
      mappingType: mapping.mappingType,
      isMapped: mapping.isMapped,
      startTime,
      preprocessEndTime,
      providerTtfbTime,
      requestHeaders: clientRequestHeaders,
      providerRequestHeaders,
      rawBody,
      standardRequestBody,
      transformedBody,
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      conversationId,
      isPassthroughEnabled,
      clientType,
      logId,
      retryCount,
      request: c.req.raw,
      routingTrace: {
        matchedRuleId: matchedRule?.id,
        matchedRuleName: matchedRule?.name,
        matchedRulePriority: matchedRule?.priority,
        modelGroupId: group.id,
        modelGroupName: group.name,
        instanceId: instance.id,
        actualModelName: instance.actualModelName,
        strategy: decision.strategy,
        instanceCost: instance.costPer1kTokens,
        routeChain,
      },
    }

    if (standardReq.stream === true) {
      const chatResponse = await handleStreamingResponse(handlerParams)
      return convertStreamToResponsesFormat(chatResponse)
    }
    const chatResponse = await handleNonStreamingResponse(handlerParams)
    const chatBody = (await chatResponse.json()) as Record<string, unknown>
    return c.json(convertChatToResponsesBody(chatBody))
  } catch (error) {
    logger.error({ error, requestId }, 'Gateway error')
    return handleGatewayError({
      error,
      c,
      virtualKey,
      requestHeaders: clientRequestHeaders,
      rawBody,
      clientIp,
      userAgent,
      clientType: clientInfo.type,
      requestPath,
      requestMethod,
      isStreaming,
      startTime,
      transformedBody,
      incomingProtocol,
      targetProtocol,
      logId,
      retryCount,
    })
  }
}
