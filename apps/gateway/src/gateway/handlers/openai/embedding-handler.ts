import type { Context } from 'hono'

import type { VirtualKey } from '@xartifact/x-herald-db'
import logger from '../../../lib/logger'
import { accessModelRouter } from '../../services/access-model-router'
import { identifyClient, resolveClientIp } from '../../services/client-identifier'
import { handleGatewayError } from '../../services/error-handler'
import { ModelNotFoundError } from '../../services/model-group-router'
import { getProviderProtocol, getProviderUrl } from '../../services/protocol-detector'
import type { ResponseHandlerParams } from '../../services/response-handlers/params'
import { handleNonStreamingResponse } from '../../services/response-handlers'
import { createTransformerContext } from '../../transformer'
import { AbortManager } from '../shared/abort-manager'
import { executeFailoverIteration } from '../shared/failover-executor'
import { markStreamAborted } from '../../services/log-service'
import { EmbeddingCandidateExecutor } from './embedding-executor'

const EMBEDDING_CATEGORY = 'embedding'
/**
 * 处理 OpenAI 兼容的 /v1/embeddings 请求。
 *
 * 与 chat 不同，embedding 是透传调用：不做协议转换，仅用 `model` 路由到
 * category=embedding 的模型组，并把原始 body 原样转发到上游 /v1/embeddings。
 * 复用虚拟 key 认证、模型路由、熔断、failover/retry、日志与错误处理链路。
 */
export async function handleEmbeddingRequest(
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
  const incomingProtocol = 'openai' as const
  let retryCount = 0

  try {
    const rawBody =
      (preprocessedBody as { model?: string; [key: string]: unknown }) ??
      ((await c.req.json()) as { model?: string; [key: string]: unknown })

    const model = rawBody.model
    logger.info({ requestId, model, protocol: incomingProtocol }, 'Processing embedding request')

    if (typeof model !== 'string' || !model) {
      return c.json({ error: { type: 'invalid_request_error', message: 'Missing model' } }, 400)
    }

    // 虚拟 key 的允许模型校验（与 chat 一致）
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
    if (!candidates.length) throw new ModelNotFoundError(model)

    // 仅用 category=embedding 的模型组；若首选候选不属于 embedding 组则跳过
    const embeddingCandidates = candidates.filter((cd) => cd.group.category === EMBEDDING_CATEGORY)
    if (embeddingCandidates.length === 0) {
      throw new ModelNotFoundError(model)
    }

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
      incomingProtocol,
      startTime,
      requestId,
    }

    try {
      for (let i = 0; i < embeddingCandidates.length; i++) {
        const routeResult = embeddingCandidates[i]
        const { instance, provider, group, decision, mapping } = routeResult
        const isLastCandidate = i === embeddingCandidates.length - 1

        const targetProtocol = getProviderProtocol(incomingProtocol, provider)
        const providerUrl = getProviderUrl(provider, targetProtocol)
        if (!providerUrl) {
          if (!isLastCandidate) continue
          return c.json(
            {
              error: {
                type: 'protocol_error',
                message: `Protocol '${targetProtocol}' not configured for provider`,
              },
            },
            400,
          )
        }

        const executor = new EmbeddingCandidateExecutor({
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
          targetProtocol,
          retryCount,
          requestGroupId,
          candidateIndex: i,
        })

        const retryConfig = {
          maxRetries: instance.config?.retryConfig?.maxRetries ?? 2,
          baseDelay: instance.config?.retryConfig?.retryDelay ?? 500,
          maxDelay: 30000,
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
        })

        retryCount = result.retryCount ?? 0
        if (result.type === 'abort') {
          if (result.aborted === 'client_disconnect') {
            // 客户端断开（TTFB 阶段）：记录为 cancelled，不计入失败率
            logger.info({ requestId }, 'Client disconnected, marking as cancelled')
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
            requestPath,
            requestMethod,
            isStreaming: false,
            startTime,
            transformedBody: executor.transformedBody,
            incomingProtocol,
            targetProtocol,
            logId: executor.logId,
            retryCount,
          })
        }
        if (result.type === 'failover') {
          logger.warn(
            { requestId, instanceId: instance.id, statusCode: result.response?.status },
            '[Embedding Failover] Instance failed, switching to next candidate',
          )
          continue
        }
        if (result.type === 'error') return result.response!

        // 成功路径：复用非流式响应处理器，把 pending 日志收尾为 success + tokens
        const handlerParams: ResponseHandlerParams = {
          c,
          response: result.response!,
          ctx: createTransformerContext(requestId),
          incomingProtocol,
          targetProtocol,
          virtualKey,
          provider,
          originalModelName: String(rawBody.model || 'unknown'),
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
        return handleNonStreamingResponse(handlerParams)
      }
    } finally {
      abortManager.dispose()
    }

    throw new Error('All candidate instances exhausted')
  } catch (error) {
    logger.error({ error, requestId }, 'Embedding gateway error')
    return handleGatewayError({
      error: error instanceof Error ? error : new Error(String(error)),
      c,
      virtualKey,
      requestHeaders: clientRequestHeaders,
      providerRequestHeaders: undefined,
      rawBody: {},
      clientIp,
      userAgent,
      requestPath,
      requestMethod,
      isStreaming: false,
      startTime,
      transformedBody: undefined,
      incomingProtocol,
      targetProtocol: 'openai',
      logId: undefined,
      retryCount,
    })
  }
}
