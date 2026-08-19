import type { Context } from 'hono'

import type { ModelGroup, ModelInstance, VirtualKey } from '@xartifact/x-herald-db'
import type { providers } from '@xartifact/x-herald-db'
import type { StandardRequest } from '@xartifact/x-herald-shared'

import logger from '../../../lib/logger'
import { circuitBreakerRegistry } from '../../services/circuit-breaker'
import {
  handleGatewayError as callGatewayError,
  handleProviderErrorPassthrough as callProviderPassthrough,
} from '../../services/error-handler'
import { shouldFilterHeader } from '../../services/headers'
import { logEventBus } from '../../services/log-event-bus'
import { logStartAsync, markLogAsFailed } from '../../services/log-service'
import type { ModelMappingResult } from '../../services/model-mapping'

import type { AbortManager } from '../shared/abort-manager'
import type { MarkLogFailedParams, PreparedRequest } from '../shared/failover-executor'
import { joinUrl } from '../shared/join-url'

const EMBEDDINGS_ENDPOINT = '/v1/embeddings'

interface CandidateInfo {
  instance: ModelInstance
  provider: typeof providers.$inferSelect
  group: ModelGroup
  matchedRule?: { id: string; name: string; priority: number }
  mapping: ModelMappingResult
  decision: { strategy: string }
}

interface EmbeddingRequestContext {
  rawBody: { model?: string; [key: string]: unknown }
  standardRequestBody?: StandardRequest
  virtualKey: VirtualKey
  clientRequestHeaders: Record<string, string>
  clientIp: string
  userAgent: string
  clientType?: string
  requestPath: string
  requestMethod: string
  isStreaming: boolean
  incomingProtocol: 'openai' | 'anthropic'
  startTime: number
  requestId: string
}

export interface EmbeddingExecutorConfig {
  c: Context
  candidate: CandidateInfo
  req: EmbeddingRequestContext
  abortManager: AbortManager
  providerUrl: string
  targetProtocol: 'openai' | 'anthropic'
  retryCount: number
  requestGroupId: string
  candidateIndex: number
}

/**
 * Embedding 候选执行器：透传原始 body 到上游 /v1/embeddings。
 *
 * 与 chat 不同，embedding 不做协议转换——请求体原样转发，仅改写 `model`
 * 为目标实例的实际模型名。复用 failover/retry/熔断/日志/错误处理链路。
 */
export class EmbeddingCandidateExecutor {
  logId?: string
  attemptId?: string
  transformedBody?: unknown
  providerRequestHeaders?: Record<string, string>
  preprocessEndTime = Date.now()

  private readonly circuitBreakerMeta: {
    instanceName: string
    groupName: string
    providerName: string
  }

  constructor(private readonly config: EmbeddingExecutorConfig) {
    const { instance, provider, group } = config.candidate
    this.circuitBreakerMeta = {
      instanceName: instance.name,
      groupName: group.name,
      providerName: provider.name,
    }
  }

  async prepareRequest(): Promise<PreparedRequest> {
    const { instance, provider, mapping } = this.candidate
    const { rawBody, requestId } = this.req
    const { providerUrl, targetProtocol } = this.config

    const filtered = Object.fromEntries(
      Object.entries(this.req.clientRequestHeaders).filter(([k]) => !shouldFilterHeader(k)),
    )

    // 透传：保留客户端全部字段，仅把 model 改写为目标实例实际模型名
    const passthroughBody: Record<string, unknown> = {
      ...rawBody,
      model: instance.actualModelName,
    }

    const targetUrl = joinUrl(providerUrl, EMBEDDINGS_ENDPOINT)
    const pHeaders: Record<string, string> = {
      ...filtered,
      authorization: `Bearer ${provider.apiKey}`,
    }

    const { logId, attemptId } = logStartAsync({
      virtualKey: this.req.virtualKey,
      modelName: mapping.modelName,
      originalModelName: mapping.originalModel,
      mappingType: mapping.mappingType,
      isMapped: mapping.isMapped,
      providerId: provider.id,
      providerName: provider.name,
      requestHeaders: this.req.clientRequestHeaders,
      providerRequestHeaders: pHeaders,
      requestBody: rawBody,
      transformedRequestBody: passthroughBody,
      clientIp: this.req.clientIp,
      userAgent: this.req.userAgent,
      clientType: this.req.clientType,
      requestPath: this.req.requestPath,
      requestMethod: this.req.requestMethod,
      incomingProtocol: this.req.incomingProtocol,
      targetProtocol,
      requestGroupId: this.config.requestGroupId,
      candidateIndex: this.config.candidateIndex,
      instanceId: instance.id,
    })
    this.logId = logId
    this.attemptId = attemptId
    this.transformedBody = passthroughBody
    this.providerRequestHeaders = pHeaders
    this.preprocessEndTime = Date.now()

    logger.debug({ requestId, targetUrl, targetProtocol, model: mapping.modelName }, 'embedding')
    return {
      url: targetUrl,
      headers: pHeaders,
      body: JSON.stringify(passthroughBody),
      isPassthroughEnabled: true,
      targetProtocol,
    }
  }

  beforeFetch(): void {
    if (this.logId) this.config.abortManager.setLogId(this.logId)
  }

  async retry(_attempt: number, _delay: number, _lastResponse?: Response): Promise<void> {
    await circuitBreakerRegistry.recordFailure(
      this.config.candidate.instance.id,
      this.circuitBreakerMeta,
    )
  }

  async recordFailure(): Promise<void> {
    await circuitBreakerRegistry.recordFailure(
      this.config.candidate.instance.id,
      this.circuitBreakerMeta,
    )
  }

  async recordSuccess(): Promise<void> {
    await circuitBreakerRegistry.recordSuccess(
      this.config.candidate.instance.id,
      this.circuitBreakerMeta,
    )
  }

  async markLogFailed(params: MarkLogFailedParams): Promise<void> {
    await markLogAsFailed(params)
  }

  emitAbortedEvent(id: string): void {
    logEventBus.emitLog({ event: 'aborted', logId: id })
  }

  async gatewayError(errorOrCode: string | Error, fallbackMessage?: string): Promise<Response> {
    const error =
      errorOrCode instanceof Error ? errorOrCode : new Error(fallbackMessage ?? errorOrCode)
    return callGatewayError({
      error,
      c: this.config.c,
      virtualKey: this.req.virtualKey,
      requestHeaders: this.req.clientRequestHeaders,
      providerRequestHeaders: this.providerRequestHeaders || {},
      rawBody: this.req.rawBody || {},
      clientIp: this.req.clientIp,
      userAgent: this.req.userAgent,
      requestPath: this.req.requestPath,
      requestMethod: this.req.requestMethod,
      isStreaming: this.req.isStreaming,
      startTime: this.req.startTime,
      transformedBody: this.transformedBody,
      incomingProtocol: this.req.incomingProtocol,
      targetProtocol: this.config.targetProtocol,
      logId: this.logId,
      retryCount: this.config.retryCount,
    })
  }

  async providerError(response: Response, _rawBody: unknown): Promise<Response> {
    const { req, candidate, config } = this
    return callProviderPassthrough({
      c: this.config.c,
      response,
      provider: candidate.provider,
      virtualKey: req.virtualKey,
      originalModelName: (req.rawBody?.model as string) || 'unknown',
      requestHeaders: req.clientRequestHeaders,
      providerRequestHeaders: this.providerRequestHeaders || {},
      rawBody: req.rawBody || {},
      clientIp: req.clientIp,
      userAgent: req.userAgent,
      requestPath: req.requestPath,
      requestMethod: req.requestMethod,
      isStreaming: req.isStreaming,
      startTime: req.startTime,
      transformedBody: this.transformedBody,
      incomingProtocol: req.incomingProtocol,
      targetProtocol: config.targetProtocol,
      logId: this.logId,
      attemptId: this.attemptId,
      retryCount: config.retryCount,
      routingTrace: undefined,
    })
  }

  async providerErrorPassthrough(response: Response, _rawBody: unknown): Promise<Response> {
    return this.providerError(response, _rawBody)
  }

  private get candidate(): CandidateInfo {
    return this.config.candidate
  }
  private get req(): EmbeddingRequestContext {
    return this.config.req
  }
}
