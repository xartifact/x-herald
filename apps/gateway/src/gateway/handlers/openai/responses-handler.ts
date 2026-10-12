import type { Context } from 'hono'

import logger from '../../../lib/logger'
import type { VirtualKey } from '@xartifact/x-herald-db'
import type { ModelInstance } from '@xartifact/x-herald-db'
import type { providers } from '@xartifact/x-herald-db'

import { accessModelRouter } from '../../services/access-model-router'
import { identifyClient, resolveClientIp } from '../../services/client-identifier'
import { handleGatewayError, type RoutingContext } from '../../services/error-handler'
import { shouldFilterHeader } from '../../services/headers'
import { logRequest, logStartAsync, type LogRequestParams } from '../../services/log-service'
import type { ModelMappingResult } from '../../services/model-mapping'
import {
  buildRouteChainSnapshot,
  type RouteChainSnapshot,
} from '../../services/routing-trace-recorder'
import { ModelNotFoundError } from '../../services/model-group-router'
import type { RouteResult } from '../../services/router-selector'
import { extractProviderResponseHeaders, parseProviderError } from '../../services/error-classifier'
import { markStreamAborted } from '../../services/log-stream'
import { logEventBus } from '../../services/log-event-bus'
import {
  StreamResponseCollector,
  createModelRemapStream,
  getClientNonStreamingHeaders,
  getClientStreamingHeaders,
  mergeResponseHeaders,
} from '../../services/response-handlers/shared'
import { UPSTREAM_STREAM_IDLE_TIMEOUT_MS } from '@xartifact/x-herald-shared'
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

interface ProviderRequest {
  transformedBody: unknown
  targetUrl: string
  requestBody: string
  providerRequestHeaders: Record<string, string>
}

export function buildProviderRequest(opts: {
  responsesBody: Record<string, unknown>
  instance: ModelInstance
  provider: typeof providers.$inferSelect
  clientRequestHeaders: Record<string, string>
  providerUrl: string
}): ProviderRequest {
  const { responsesBody, instance, provider, clientRequestHeaders, providerUrl } = opts
  const filtered = Object.fromEntries(
    Object.entries(clientRequestHeaders).filter(([k]) => !shouldFilterHeader(k)),
  )

  const transformedBody: Record<string, unknown> = {
    ...responsesBody,
    model: instance.actualModelName,
  }
  return {
    transformedBody,
    targetUrl: joinUrl(providerUrl, '/responses'),
    requestBody: JSON.stringify(transformedBody),
    providerRequestHeaders: { ...filtered, authorization: `Bearer ${provider.apiKey}` },
  }
}

function buildLogParams(opts: {
  candidate: RouteResult
  clientRequestHeaders: Record<string, string>
  responsesBody: unknown
  providerRequestHeaders: Record<string, string>
  transformedBody: unknown
  clientIp: string
  userAgent: string
  clientType?: string
  requestPath: string
  requestMethod: string
  incomingProtocol: 'responses'
  targetProtocol: 'responses'
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
  let providerRequestHeaders: Record<string, string> | undefined
  let logId: string | undefined
  let attemptId: string | undefined
  const requestGroupId = crypto.randomUUID()
  let retryCount = 0
  let routingContextParams: RoutingContext | undefined

  try {
    const responsesBody = preprocessedBody ?? ((await c.req.json()) as Record<string, unknown>)
    rawBody = responsesBody as { model?: string; [key: string]: unknown }
    logger.info(
      { requestId, model: rawBody.model, protocol: 'responses' },
      'Processing Responses API request',
    )

    const requestedModel = typeof rawBody.model === 'string' ? rawBody.model : ''
    const isStreamingRequest = responsesBody.stream === true
    const responsesTools = Array.isArray(responsesBody.tools) ? responsesBody.tools : []
    const responsesInput = Array.isArray(responsesBody.input) ? responsesBody.input : []
    const hasTools = responsesTools.length > 0
    const hasVision = responsesInput.some((item) => {
      if (!item || typeof item !== 'object' || !('content' in item)) return false
      const content = (item as { content: unknown }).content
      if (typeof content === 'string') return content.includes('input_image')
      if (!Array.isArray(content)) return false
      return content.some((part) => {
        if (!part || typeof part !== 'object' || !('type' in part)) return false
        return (part as { type: unknown }).type === 'input_image'
      })
    })

    if (virtualKey.allowedModels?.length && !virtualKey.allowedModels.includes(requestedModel)) {
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
      requestedModel,
      streaming: isStreamingRequest,
      hasTools,
      hasVision,
      virtualKeyId: virtualKey.id,
      workspaceId: virtualKey.workspaceId,
    })
    if (!routeResult) throw new ModelNotFoundError(requestedModel)

    const routeChain = buildRouteChainSnapshot(
      [routeResult],
      requestedModel,
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
    const { instance, provider, group, decision, mapping } = routeResult
    // 完整路由上下文：logStart 与后续所有 logRequest 收尾共用，
    // 保证 actualModelName / instanceId 等不被 { routeChain } 精简版覆盖丢失
    const routingTraceContext = {
      matchedRuleId: routeResult.matchedRule?.id,
      matchedRuleName: routeResult.matchedRule?.name,
      matchedRulePriority: routeResult.matchedRule?.priority,
      modelGroupId: group.id,
      modelGroupName: group.name,
      instanceId: instance.id,
      actualModelName: instance.actualModelName,
      strategy: decision.strategy,
      instanceCost: instance.costPer1kTokens,
      routeChain,
    }

    // handleGatewayError fallback 分支的路由上下文：对齐正常日志的模型/服务商展示
    routingContextParams = {
      providerId: provider.id,
      providerName: provider.name,
      modelName: mapping.modelName,
      originalModelName: mapping.originalModel,
      actualModelName: instance.actualModelName,
      instanceId: instance.id,
      modelGroupId: group.id,
      modelGroupName: group.name,
      strategy: decision.strategy,
    }

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

    const providerProtocols = provider.protocols as
      | Record<string, { enabled?: boolean; baseUrl?: string }>
      | undefined
    if (!providerProtocols?.openai?.enabled) {
      return c.json(
        {
          error: {
            type: 'protocol_error',
            message: `Responses API requires an OpenAI-compatible provider; provider '${provider.name}' does not enable the openai protocol`,
          },
        },
        400,
      )
    }
    const providerUrl = providerProtocols.openai.baseUrl
    if (!providerUrl) {
      return c.json(
        {
          error: {
            type: 'protocol_error',
            message: `Protocol 'openai' not configured for provider '${provider.name}'`,
          },
        },
        400,
      )
    }

    const providerReq = buildProviderRequest({
      responsesBody: responsesBody as Record<string, unknown>,
      instance,
      provider,
      clientRequestHeaders,
      providerUrl,
    })
    providerRequestHeaders = providerReq.providerRequestHeaders
    transformedBody = providerReq.transformedBody
    const targetUrl = providerReq.targetUrl

    logger.debug(
      {
        requestId,
        targetUrl,
        model: instance.actualModelName,
      },
      'Forwarding Responses request to provider',
    )

    ;({ logId, attemptId } = logStartAsync({
      ...buildLogParams({
        candidate: routeResult,
        clientRequestHeaders,
        responsesBody,
        providerRequestHeaders,
        transformedBody,
        clientIp,
        userAgent,
        clientType,
        requestPath,
        requestMethod,
        incomingProtocol: 'responses',
        targetProtocol: 'responses',
        conversationId,
        virtualKey,
      }),
      requestGroupId,
      candidateIndex: 0,
    }))

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
          fetch(targetUrl, {
            method: 'POST',
            headers: providerRequestHeaders,
            body: JSON.stringify(transformedBody),
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

      if (retryResult.aborted === 'client_disconnect') {
        // 客户端断开（TTFB 阶段）：记为 cancelled，不计入失败率（与其他 handler 对齐）
        logger.info({ requestId, logId }, 'Client disconnected, marking as cancelled')
        if (logId) {
          await markStreamAborted(logId, attemptId ?? '', false, { forceCancelled: true })
          logEventBus.emitLog({
            event: 'aborted',
            workspaceId: virtualKey.workspaceId,
            logId,
          })
        }
        return new Response(null, { status: 499 })
      }
      if (retryResult.aborted === 'timeout' || !rawResponse) {
        const abortMessage =
          retryResult.aborted === 'timeout'
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
          logId,
          retryCount,
          routingContext: routingContextParams,
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
      const responseTimeMs = Date.now() - startTime
      const providerResponseHeaders = extractProviderResponseHeaders(upstreamResponse)
      const errorBody = await parseProviderError(upstreamResponse)
      const errorPayload = errorBody.error
      const rawErrorMessage =
        errorPayload && typeof errorPayload === 'object' && 'message' in errorPayload
          ? String(errorPayload.message) || 'Provider request failed'
          : 'Provider request failed'
      await logRequest({
        virtualKey,
        modelName: mapping.modelName,
        originalModelName: mapping.originalModel,
        providerId: provider.id,
        providerName: provider.name,
        status: 'failure',
        statusCode: upstreamResponse.status,
        responseTimeMs,
        requestHeaders: clientRequestHeaders,
        providerRequestHeaders,
        requestBody: responsesBody,
        transformedRequestBody: transformedBody,
        providerResponseHeaders,
        providerResponseBody: errorBody,
        responseBody: errorBody,
        errorMessage: rawErrorMessage,
        errorType: 'provider_error',
        clientIp,
        userAgent,
        clientType,
        requestPath,
        requestMethod,
        streaming: isStreaming,
        incomingProtocol: 'responses',
        targetProtocol: 'responses',
        conversationId,
        logId,
        attemptId,
        retryCount,
        routingTrace: routingTraceContext,
      })
      // parseProviderError 已消费 body（内部 response.text()），直接复用
      // upstreamResponse.body 会抛 "Body object should not be disturbed or locked"，
      // 错误会被外层 catch 吞成通用网关 500。用已读出的错误体原样重建。
      return new Response(JSON.stringify(errorBody), {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: providerResponseHeaders,
      })
    }

    function streamNativeResponses(params: {
      upstreamResponse: Response
      providerStream: ReadableStream<Uint8Array>
      mergedHeaders: Record<string, string>
      startTime: number
      providerTtfbTime: number
      virtualKey: VirtualKey
      mapping: ModelMappingResult
      provider: { id: string; name: string }
      clientRequestHeaders: Record<string, string>
      providerRequestHeaders: Record<string, string>
      responsesBody: Record<string, unknown>
      transformedBody: unknown
      clientIp: string
      userAgent: string
      clientType?: string
      requestPath: string
      requestMethod: string
      conversationId?: string
      logId?: string
      attemptId?: string
      retryCount: number
      routingTrace: NonNullable<LogRequestParams['routingTrace']>
      routeChain: RouteChainSnapshot
    }): Response {
      const {
        upstreamResponse,
        providerStream,
        mergedHeaders,
        startTime,
        providerTtfbTime,
        virtualKey,
        mapping,
        provider,
        clientRequestHeaders,
        providerRequestHeaders,
        responsesBody,
        transformedBody,
        clientIp,
        userAgent,
        clientType,
        requestPath,
        requestMethod,
        conversationId,
        logId,
        attemptId,
        retryCount,
        routingTrace: routingTraceContext,
      } = params

      // 采集 usage（response.completed 事件）、thinking/content 分块与 provider 模型名。
      // Responses 流事件没有 choices/delta 形状，StreamResponseCollector 的
      // content/thinking 提取对它不生效，但 usage（extractUsageFromChunk 的
      // response.completed 分支）和进度/时序采集仍然有效。
      const collector = new StreamResponseCollector()
      let isLogFinalized = false

      const finalize = (status: 'success' | 'failure', statusCode: number) => {
        if (isLogFinalized) return
        isLogFinalized = true
        const now = Date.now()
        const usage = collector.getUsage()
        void logRequest({
          virtualKey,
          modelName: mapping.modelName,
          originalModelName: mapping.originalModel,
          mappingType: mapping.mappingType,
          isMapped: mapping.isMapped,
          providerId: provider.id,
          providerName: provider.name,
          status,
          statusCode,
          responseTimeMs: now - startTime,
          requestHeaders: clientRequestHeaders,
          providerRequestHeaders,
          requestBody: responsesBody,
          transformedRequestBody: transformedBody,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          streaming: true,
          incomingProtocol: 'responses',
          targetProtocol: 'responses',
          conversationId,
          clientIp,
          userAgent,
          clientType,
          requestPath,
          requestMethod,
          logId,
          attemptId,
          retryCount,
          providerTtfbMs: providerTtfbTime > 0 ? providerTtfbTime - (startTime + 1) : undefined,
          streamDurationMs: now - Math.max(providerTtfbTime, startTime + 1),
          routingTrace: {
            ...routingTraceContext,
            responseModelName: collector.getProviderModel() ?? undefined,
          },
        })
      }

      let streamIdleTimer: ReturnType<typeof setTimeout> | undefined
      const resetStreamIdleTimer = (controller: TransformStreamDefaultController<Uint8Array>) => {
        clearTimeout(streamIdleTimer)
        streamIdleTimer = setTimeout(() => {
          logger.warn(
            { logId, attemptId },
            `Upstream stream idle timeout after ${UPSTREAM_STREAM_IDLE_TIMEOUT_MS / 1000}s, terminating`,
          )
          controller.terminate()
          finalize('failure', 599)
        }, UPSTREAM_STREAM_IDLE_TIMEOUT_MS)
      }

      const decoder = new TextDecoder()
      const monitorTransformer = {
        transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
          resetStreamIdleTimer(controller)
          // SSE 事件可能跨 chunk 分割，逐行解析前先缓冲残行
          const text = decoder.decode(chunk, { stream: true })
          for (const line of text.split('\n')) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (!data || data === '[DONE]') continue
            collector.processEvent(data)
          }
          controller.enqueue(chunk)
        },
        flush() {
          clearTimeout(streamIdleTimer)
          finalize('success', upstreamResponse.status)
        },
        cancel(reason: unknown) {
          // 客户端断开：单写者收尾，避免 finalize('failure') 与 markStreamAborted
          // 并发写库互相覆盖（此前 66 条 provider_error 漂移记录的来源）。
          // usage/responseModelName 已由 collector 采集，随收尾一次性入账。
          clearTimeout(streamIdleTimer)
          const usage = collector.getUsage()
          const sawChunks =
            usage.inputTokens > 0 || usage.outputTokens > 0 || collector.hasFinished()
          if (logId && !logId.startsWith('temp-')) {
            void markStreamAborted(logId, attemptId ?? '', sawChunks, {
              usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
              responseModelName: collector.getProviderModel(),
              terminalSeen: collector.hasFinished(),
            })
          }
          logger.info({ logId, attemptId, reason }, 'Responses stream cancelled by client')
        },
        // bun-types 的 Transformer 接口尚未声明 cancel（Bun 运行时已支持，实测触发）。
        // 断言收窄到 Transformer 形状，类型补齐后可直接移除。
      } as unknown as Transformer<Uint8Array, Uint8Array>
      const monitor = new TransformStream<Uint8Array, Uint8Array>(monitorTransformer)

      let clientStream: ReadableStream<Uint8Array> = providerStream.pipeThrough(monitor)
      // 模型映射启用时，把流事件里的 response.model 回写为客户端请求的原始模型名。
      if (mapping.isMapped && mapping.originalModel) {
        clientStream = clientStream.pipeThrough(
          createModelRemapStream(mapping.originalModel),
        ) as unknown as ReadableStream<Uint8Array>
      }
      return new Response(clientStream, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: mergedHeaders,
      })
    }

    const responseTimeMs = Date.now() - startTime
    const providerResponseHeaders = extractProviderResponseHeaders(upstreamResponse)
    const mergedHeaders = mergeResponseHeaders(
      getClientStreamingHeaders(providerResponseHeaders['content-type']),
      providerResponseHeaders,
    )
    const providerStream = upstreamResponse.body
    if (isStreaming && providerStream) {
      return streamNativeResponses({
        upstreamResponse,
        providerStream,
        mergedHeaders,
        startTime,
        providerTtfbTime,
        virtualKey,
        mapping,
        provider,
        clientRequestHeaders,
        providerRequestHeaders,
        responsesBody,
        transformedBody,
        clientIp,
        userAgent,
        clientType,
        requestPath,
        requestMethod,
        conversationId,
        logId,
        attemptId,
        retryCount,
        routingTrace: routingTraceContext,
        routeChain,
      })
    }
    if (isStreaming) {
      return new Response(null, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: mergedHeaders,
      })
    }
    const clonedForLog = upstreamResponse.clone()
    const providerResponseBody = (await clonedForLog.json().catch(() => null)) as unknown
    // Responses 非流式：usage 形状是 { input_tokens, output_tokens }，
    // 不传给 logRequest 会走 messages/choices 估算 → 恒 0，token 日配额不扣。
    const usage = (providerResponseBody as Record<string, unknown> | null)?.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined
    await logRequest({
      virtualKey,
      modelName: mapping.modelName,
      originalModelName: mapping.originalModel,
      mappingType: mapping.mappingType,
      isMapped: mapping.isMapped,
      providerId: provider.id,
      providerName: provider.name,
      status: 'success',
      statusCode: upstreamResponse.status,
      responseTimeMs,
      requestHeaders: clientRequestHeaders,
      providerRequestHeaders,
      requestBody: responsesBody,
      transformedRequestBody: transformedBody,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      providerResponseHeaders,
      providerResponseBody,
      responseBody: providerResponseBody,
      clientIp,
      userAgent,
      clientType,
      requestPath,
      requestMethod,
      streaming: false,
      incomingProtocol: 'responses',
      targetProtocol: 'responses',
      conversationId,
      logId,
      attemptId,
      retryCount,
      routingTrace: {
        ...routingTraceContext,
        responseModelName: (providerResponseBody as Record<string, unknown> | null)?.model as
          | string
          | undefined,
      },
    })
    // 模型映射启用时，响应体里的 model 是 provider 内部模型名；
    // 回写 originalModelName 保持对客户端透明（与 chat 路径 non-streaming.ts 一致）。
    // 仅 JSON 响应且包含 model 字段时改写；流式响应的改写成本高，保持原样。
    if (
      mapping.isMapped &&
      mapping.originalModel &&
      providerResponseBody &&
      typeof providerResponseBody === 'object' &&
      'model' in providerResponseBody
    ) {
      ;(providerResponseBody as Record<string, unknown>).model = mapping.originalModel
      return new Response(JSON.stringify(providerResponseBody), {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: mergeResponseHeaders(getClientNonStreamingHeaders(), providerResponseHeaders),
      })
    }
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: mergeResponseHeaders(getClientNonStreamingHeaders(), providerResponseHeaders),
    })
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
      logId,
      retryCount,
      routingContext: routingContextParams,
    })
  }
}
