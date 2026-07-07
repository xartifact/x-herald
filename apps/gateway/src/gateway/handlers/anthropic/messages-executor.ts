import type { Context } from 'hono'

import logger from '../../../lib/logger'
import type { VirtualKey } from '@xartifact/x-llm-gateway-db'
import type { ModelGroup, ModelInstance } from '@xartifact/x-llm-gateway-db'
import type { providers } from '@xartifact/x-llm-gateway-db'
import type { StandardRequest } from '@xartifact/x-llm-gateway-shared'
import type { TransformerContext } from '@xartifact/x-llm-gateway-shared'

import { circuitBreakerRegistry } from '../../services/circuit-breaker'
import {
  handleGatewayError as callGatewayError,
  handleProviderError as callProviderError,
  handleProviderErrorPassthrough as callProviderPassthrough,
} from '../../services/error-handler'
import { shouldFilterHeader } from '../../services/headers'
import { logEventBus } from '../../services/log-event-bus'
import { logStartAsync, markLogAsFailed } from '../../services/log-service'
import type { ModelMappingResult } from '../../services/model-mapping'
import { getEndpoint } from '../../services/protocol-detector'
import { getTransformer } from '../../transformer'
import { buildHeaders } from '../../transformer/shared/parameter-transformer'
import type { AbortManager } from '../shared/abort-manager'
import type { PreparedRequest } from '../shared/failover-executor'
import { joinUrl } from '../shared/join-url'
import {
  hasAssistantMessagesWithoutThinking,
  injectSyntheticThinkingBlocks,
  normalizeAnthropicPassthroughMessages,
} from './thinking-validator'

interface CandidateInfo {
  instance: ModelInstance
  provider: typeof providers.$inferSelect
  group: ModelGroup
  matchedRule?: { id: string; name: string; priority: number }
  mapping: ModelMappingResult
  decision: { strategy: string }
}

interface RequestContext {
  rawBody: { model?: string; [key: string]: unknown }
  standardReq: StandardRequest
  standardRequestBody: StandardRequest
  virtualKey: VirtualKey
  clientRequestHeaders: Record<string, string>
  clientIp: string
  userAgent: string
  clientType?: string
  requestPath: string
  requestMethod: string
  conversationId?: string
  isStreaming: boolean
  incomingProtocol: 'anthropic'
  startTime: number
  requestId: string
}

export interface AnthropicExecutorConfig {
  requestGroupId: string
  candidateIndex: number
  c: Context
  ctx: TransformerContext
  candidate: CandidateInfo
  req: RequestContext
  abortManager: AbortManager
  providerUrl: string
  isPassthroughEnabled: boolean
  targetProtocol: 'openai' | 'anthropic'
  retryCount: number
}

export class AnthropicMessagesExecutor {
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

  constructor(private readonly config: AnthropicExecutorConfig) {
    const { instance, provider, group } = config.candidate
    this.circuitBreakerMeta = {
      instanceName: instance.name,
      groupName: group.name,
      providerName: provider.name,
    }
  }

  async prepareRequest(): Promise<PreparedRequest> {
    const { instance, provider } = this.candidate
    const { standardReq, requestId } = this.req
    const { providerUrl, isPassthroughEnabled, targetProtocol } = this.config

    standardReq.model = instance.actualModelName
    this.ctx.provider = {
      name: provider.name,
      baseUrl: providerUrl,
      apiKey: provider.apiKey || '',
      protocol: targetProtocol,
      models: [],
      protocols: provider.protocols as Record<string, { baseUrl: string; enabled: boolean }>,
    }
    this.ctx.instanceConfig = (instance.config ?? undefined) as Record<string, unknown> | undefined

    const { transformedBody, targetUrl, pHeaders } = await this.buildProviderParts()

    logger.debug(
      {
        requestId,
        targetUrl,
        targetProtocol,
        model: standardReq.model,
        isPassthrough: isPassthroughEnabled,
      },
      'Forwarding to provider',
    )

    const { logId, attemptId } = logStartAsync(this.buildLogStartParams(transformedBody, pHeaders))
    this.logId = logId
    this.attemptId = attemptId
    this.transformedBody = transformedBody
    this.providerRequestHeaders = pHeaders
    this.preprocessEndTime = Date.now()
    return {
      url: targetUrl,
      headers: pHeaders,
      body: JSON.stringify(transformedBody),
      isPassthroughEnabled,
      targetProtocol,
    }
  }

  private async buildProviderParts(): Promise<{
    transformedBody: unknown
    targetUrl: string
    pHeaders: Record<string, string>
  }> {
    const { instance, provider } = this.candidate
    const { isPassthroughEnabled, providerUrl, targetProtocol } = this.config
    const { standardReq, rawBody, isStreaming, clientRequestHeaders } = this.req
    const filtered = Object.fromEntries(
      Object.entries(clientRequestHeaders).filter(([k]) => !shouldFilterHeader(k)),
    )

    if (isPassthroughEnabled) {
      const passthroughBody: { model?: string; messages?: unknown[]; [key: string]: unknown } = {
        ...rawBody,
        model: instance.actualModelName,
      }
      if (Array.isArray(passthroughBody.messages)) {
        passthroughBody.messages = normalizeAnthropicPassthroughMessages(
          passthroughBody.messages as Array<{ role: string; content: unknown }>,
        )
        const supportsThinking =
          provider.protocols?.anthropic?.enabled &&
          (instance.config?.supportsThinking === true ||
            instance.actualModelName.includes('claude-3-7-') ||
            instance.actualModelName.includes('claude-4'))
        if (
          supportsThinking &&
          hasAssistantMessagesWithoutThinking(
            passthroughBody.messages as Array<{ role: string; content: unknown }>,
          )
        ) {
          passthroughBody.messages = injectSyntheticThinkingBlocks(
            passthroughBody.messages as Array<{ role: string; content: unknown }>,
          )
        }
      }
      return {
        transformedBody: passthroughBody,
        targetUrl: joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming)),
        pHeaders: { ...filtered, 'x-api-key': provider.apiKey || '' },
      }
    }

    const egressTransformer = getTransformer(targetProtocol)
    if (!egressTransformer?.adaptRequest)
      throw new Error(`No adapter found for protocol: ${targetProtocol}`)
    const adapted = await egressTransformer.adaptRequest(standardReq, this.ctx)
    const adaptedHeaders = Object.fromEntries(
      Object.entries(adapted.headers || {}).map(([k, v]) => [k.toLowerCase(), v]),
    )
    const authHeader: Record<string, string> =
      targetProtocol === 'anthropic'
        ? { 'x-api-key': provider.apiKey || '' }
        : { authorization: `Bearer ${provider.apiKey}` }
    let pHeaders = { ...filtered, ...adaptedHeaders, ...authHeader }
    const hdrs = this.ctx.instanceConfig as Record<string, unknown> | undefined
    if (hdrs?.customHeaders)
      pHeaders = buildHeaders(pHeaders, hdrs.customHeaders as Record<string, string>, this.ctx)
    return {
      transformedBody: adapted.body,
      targetUrl: adapted.url || joinUrl(providerUrl, getEndpoint(targetProtocol, isStreaming)),
      pHeaders,
    }
  }

  private buildLogStartParams(transformedBody: unknown, pHeaders: Record<string, string>) {
    const { instance, provider, group, matchedRule, mapping, decision } = this.candidate
    const {
      rawBody,
      virtualKey,
      clientRequestHeaders,
      clientIp,
      userAgent,
      clientType,
      requestPath,
      requestMethod,
      conversationId,
      incomingProtocol,
    } = this.req
    const { targetProtocol, requestGroupId, candidateIndex } = this.config
    return {
      virtualKey,
      modelName: mapping.modelName,
      originalModelName: mapping.originalModel,
      mappingType: mapping.mappingType,
      isMapped: mapping.isMapped,
      providerId: provider.id,
      providerName: provider.name,
      requestHeaders: clientRequestHeaders,
      providerRequestHeaders: pHeaders,
      requestBody: rawBody,
      transformedRequestBody: transformedBody,
      clientIp,
      userAgent,
      clientType,
      requestPath,
      requestMethod,
      incomingProtocol,
      targetProtocol,
      conversationId,
      requestGroupId,
      candidateIndex,
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
      },
    }
  }

  beforeFetch(): void {
    const { abortManager, candidate, req } = this.config
    const { provider, mapping } = candidate
    const { isStreaming, startTime, incomingProtocol, virtualKey, rawBody } = req

    if (this.logId) abortManager.setLogId(this.logId)
    if (isStreaming && this.logId) {
      logEventBus.emitLog({
        event: 'waiting',
        logId: this.logId,
        modelName:
          mapping.modelName || mapping.originalModel || (rawBody?.model as string) || 'unknown',
        originalModelName: mapping.originalModel ?? undefined,
        providerName: provider.name,
        virtualKeyName: virtualKey.name ?? undefined,
        startTime,
        incomingProtocol,
      })
    }
  }

  async retry(attempt: number, delay: number, lastResponse?: Response): Promise<void> {
    logger.info(
      {
        requestId: this.config.req.requestId,
        attempt,
        statusCode: lastResponse?.status,
        retryDelay: delay,
      },
      '[Retry] Retrying upstream request',
    )
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

  async markLogFailed(
    params: import('../shared/failover-executor').MarkLogFailedParams,
  ): Promise<void> {
    await markLogAsFailed(params)
  }

  emitAbortedEvent(id: string): void {
    logEventBus.emitLog({ event: 'aborted', logId: id })
  }

  async gatewayError(_errorCode: string | Error, message?: string): Promise<Response> {
    const { c, req, config } = this
    const error = _errorCode instanceof Error ? _errorCode : new Error(message ?? _errorCode)
    return callGatewayError({
      error,
      c,
      virtualKey: req.virtualKey,
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
      retryCount: config.retryCount,
    })
  }

  async providerError(response: Response, _rawBody: unknown): Promise<Response> {
    const { c, req, candidate, config } = this
    const handler = config.isPassthroughEnabled ? callProviderPassthrough : callProviderError
    return handler({
      c,
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
    })
  }

  async providerErrorPassthrough(response: Response, _rawBody: unknown): Promise<Response> {
    const { c, req, candidate, config } = this
    return callProviderPassthrough({
      c,
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
    })
  }

  private get c(): Context {
    return this.config.c
  }
  private get ctx(): TransformerContext {
    return this.config.ctx
  }
  private get req() {
    return this.config.req
  }
  private get candidate() {
    return this.config.candidate
  }
}
