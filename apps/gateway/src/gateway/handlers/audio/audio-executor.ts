/**
 * 语音端点候选执行器。
 *
 * 与 `PassthroughCandidateExecutor` 的差别只有三处，全部源于音频不是 JSON 协议：
 *  1. 上行 body 可能是 `multipart/form-data`（转录）或 JSON（合成），分别按字节改写与重写；
 *  2. 下行 body 是二进制音频（或 `text/plain` 转写文本），**不得** JSON 解析或整体缓冲；
 *  3. 成功日志不落请求/响应内容 —— 音频与完整转写文本属隐私数据（需求 §5），
 *     只记字节数、时长、首字节延迟。
 *
 * 熔断、重试、failover、虚拟密钥、错误映射全部复用现有链路。
 */
import type { Context } from 'hono'

import type { ModelGroup, ModelInstance, VirtualKey } from '@xartifact/x-herald-db'
import type { providers } from '@xartifact/x-herald-db'

import logger from '../../../lib/logger'
import { circuitBreakerRegistry } from '../../services/circuit-breaker'
import { handleGatewayError as callGatewayError } from '../../services/error-handler'
import { shouldFilterHeader } from '../../services/headers'
import { logEventBus } from '../../services/log-event-bus'
import { logRequest, logStartAsync, markLogAsFailed } from '../../services/log-service'
import type { ModelMappingResult } from '../../services/model-mapping'
import { routingContextFromCandidate } from '../../services/routing-context'

import type { AbortManager } from '../shared/abort-manager'
import type { MarkLogFailedParams, PreparedRequest } from '../shared/failover-executor'
import { joinUrl } from '../shared/join-url'

export interface AudioCandidateInfo {
  instance: ModelInstance
  provider: typeof providers.$inferSelect
  group: ModelGroup
  matchedRule?: { id: string; name: string; priority: number }
  mapping: ModelMappingResult
  decision: { strategy: string }
}

/** 上行载荷：multipart 原样字节（已改写 model）或 JSON 字符串 */
export type AudioUpload =
  | {
      kind: 'multipart'
      contentType: string
      /** 已把 model 字段改写为目标实例实际模型名的完整 multipart body */
      body: Uint8Array
      /** 客户端原始文件名，仅用于日志（不记录内容） */
      fileName?: string
      /** 客户端上传字节数 */
      bytes: number
    }
  | {
      kind: 'json'
      body: string
      /** 待合成文本字符数，仅用于日志 */
      inputChars: number
    }

export interface AudioRequestContext {
  virtualKey: VirtualKey
  clientRequestHeaders: Record<string, string>
  clientIp: string
  userAgent: string
  clientType?: string
  requestPath: string
  requestMethod: string
  incomingProtocol: string
  startTime: number
  requestId: string
  /** 客户端请求的模型名（对外名） */
  requestedModel: string
  /** 客户端声明的音频字节数（multipart 的 file part） */
  uploadBytes?: number
  /** 客户端声明的文本字符数（TTS input） */
  inputChars?: number
  /** 客户端请求的响应格式（`json` / `text` / `wav` / `mp3` / `pcm` …） */
  responseFormat?: string
}

export interface AudioExecutorConfig {
  c: Context
  candidate: AudioCandidateInfo
  req: AudioRequestContext
  abortManager: AbortManager
  providerUrl: string
  endpoint: string
  targetProtocol: 'asr' | 'tts'
  retryCount: number
  requestGroupId: string
  candidateIndex: number
}

/** `attachment; filename="x.wav"` → `x.wav` */
function fileNameFromContentDisposition(header: string | null): string | undefined {
  if (!header) return undefined
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)?.[1]
  const plain = /filename="?([^";]+)"?/i.exec(header)?.[1]
  const raw = (star ?? plain)?.trim()
  if (!raw) return undefined
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** 观测用的转写响应留存上限：超过就放弃提取 duration，不影响转发 */
const MAX_OBSERVED_JSON_BYTES = 1024 * 1024

/**
 * 从 `verbose_json` 转写响应里取音频时长。
 *
 * 只有上游给出 `duration`（OpenAI verbose_json 契约）时才返回；缺失或解析失败返回
 * undefined —— 需求 §5 要求日志记录时长，但时长是上游事实，不能靠猜。
 */
function extractDurationSeconds(chunks: Uint8Array[]): number | undefined {
  try {
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    const merged = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(merged))
    if (!parsed || typeof parsed !== 'object' || !('duration' in parsed)) return undefined
    const duration = parsed.duration
    return typeof duration === 'number' && Number.isFinite(duration) && duration >= 0
      ? duration
      : undefined
  } catch {
    return undefined
  }
}

/** 判断上游 content-type 是否为音频（决定 `outputBytes` 语义） */
function isAudioContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase()
  return lower.startsWith('audio/') || lower.includes('octet-stream')
}

export class AudioCandidateExecutor {
  logId?: string
  attemptId?: string
  providerRequestHeaders?: Record<string, string>
  preprocessEndTime = Date.now()
  /** 上游首字节到达时间（由 handler 在收到响应后回填） */
  providerTtfbTime = 0

  private readonly circuitBreakerMeta: {
    instanceName: string
    groupName: string
    providerName: string
  }

  constructor(
    private readonly config: AudioExecutorConfig,
    private readonly upload: AudioUpload,
  ) {
    const { instance, provider, group } = config.candidate
    this.circuitBreakerMeta = {
      instanceName: instance.name,
      groupName: group.name,
      providerName: provider.name,
    }
  }

  async prepareRequest(): Promise<PreparedRequest> {
    const { instance, provider, mapping } = this.candidate
    const { requestId } = this.req
    const { providerUrl, targetProtocol, endpoint } = this.config

    const filtered = Object.fromEntries(
      Object.entries(this.req.clientRequestHeaders).filter(([k]) => !shouldFilterHeader(k)),
    )
    const targetUrl = joinUrl(providerUrl, endpoint)
    const pHeaders: Record<string, string> = {
      ...filtered,
      authorization: `Bearer ${provider.apiKey}`,
    }

    let body: PreparedRequest['body']
    if (this.upload.kind === 'multipart') {
      // 保留客户端原始 content-type（含 boundary）；字节已按目标模型改写
      pHeaders['content-type'] = this.upload.contentType
      delete pHeaders['content-length'] // fetch 会按实际字节补齐
      body = this.upload.body
    } else {
      pHeaders['content-type'] = 'application/json'
      body = this.upload.body
    }

    const audioMeta = {
      audioKind: this.upload.kind,
      audioBytes: this.upload.kind === 'multipart' ? this.upload.bytes : undefined,
      audioFileName: this.upload.kind === 'multipart' ? this.upload.fileName : undefined,
      textChars: this.upload.kind === 'json' ? this.upload.inputChars : undefined,
      responseFormat: this.req.responseFormat,
    }

    const { logId, attemptId } = logStartAsync({
      virtualKey: this.req.virtualKey,
      streaming: false,
      modelName: mapping.modelName,
      originalModelName: mapping.originalModel,
      mappingType: mapping.mappingType,
      isMapped: mapping.isMapped,
      providerId: provider.id,
      providerName: provider.name,
      requestHeaders: this.req.clientRequestHeaders,
      providerRequestHeaders: pHeaders,
      // 音频内容与转写文本不入库：请求体只留结构元数据
      requestBody: audioMeta,
      transformedRequestBody: undefined,
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
    this.providerRequestHeaders = pHeaders
    this.preprocessEndTime = Date.now()

    logger.debug(
      { requestId, targetUrl, targetProtocol, model: mapping.modelName, kind: this.upload.kind },
      'audio passthrough',
    )
    return {
      url: targetUrl,
      headers: pHeaders,
      body,
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
    // errorType 由音频路径显式给出（upstream_timeout / provider_error），
    // 其余字段原样交给通用失败落库
    await markLogAsFailed({ ...params, errorType: params.errorType })
  }

  emitAbortedEvent(id: string): void {
    logEventBus.emitLog({ event: 'aborted', logId: id })
  }

  async gatewayError(errorOrCode: string | Error, fallbackMessage?: string): Promise<Response> {
    // ttfb_timeout / network_error 走网关错误码路径：上游在预算内未回包属 504 语义，
    // 不是网关内部错误（需求 §6 #8：超时 → 504 且日志记录 errorType）。
    const code = typeof errorOrCode === 'string' ? errorOrCode : undefined
    const error =
      errorOrCode instanceof Error ? errorOrCode : new Error(fallbackMessage ?? errorOrCode)
    if (code === 'ttfb_timeout') {
      await this.markLogFailed({
        logId: this.logId ?? '',
        attemptId: this.attemptId ?? '',
        statusCode: 504,
        errorMessage: fallbackMessage ?? 'Provider response timeout',
        errorType: 'upstream_timeout',
        failoverReason: 'ttfb_timeout',
        retryCount: this.config.retryCount,
        responseTimeMs: Date.now() - this.req.startTime,
      })
      return this.config.c.json(
        {
          error: {
            type: 'upstream_timeout',
            message: fallbackMessage ?? 'Provider response timeout',
          },
        },
        504,
      )
    }
    if (code === 'network_error') {
      await this.markLogFailed({
        logId: this.logId ?? '',
        attemptId: this.attemptId ?? '',
        statusCode: 502,
        errorMessage: fallbackMessage ?? 'Connection to provider failed',
        errorType: 'upstream_unreachable',
        failoverReason: 'network_error',
        retryCount: this.config.retryCount,
        responseTimeMs: Date.now() - this.req.startTime,
      })
      return this.config.c.json(
        {
          error: {
            type: 'upstream_unreachable',
            message: fallbackMessage ?? 'Connection to provider failed',
          },
        },
        502,
      )
    }
    return callGatewayError({
      error,
      c: this.config.c,
      virtualKey: this.req.virtualKey,
      requestHeaders: this.req.clientRequestHeaders,
      providerRequestHeaders: this.providerRequestHeaders || {},
      rawBody: { model: this.req.requestedModel },
      clientIp: this.req.clientIp,
      userAgent: this.req.userAgent,
      clientType: this.req.clientType,
      requestPath: this.req.requestPath,
      requestMethod: this.req.requestMethod,
      isStreaming: false,
      startTime: this.req.startTime,
      incomingProtocol: this.req.incomingProtocol,
      targetProtocol: this.config.targetProtocol,
      logId: this.logId,
      retryCount: this.config.retryCount,
      routingContext: routingContextFromCandidate(this.candidate),
    })
  }

  /**
   * 上游非 2xx。
   *
   * 音频上游（whisper-server / sherpa / 自建）返回的错误体常是纯文本或 HTML，
   * `handleProviderErrorPassthrough` 会把 body 当 JSON 解析并对客户端回 `text/plain`，
   * 客户端无法按统一结构处理。
   *
   * 因此这里：先落失败日志（保留上游原始错误消息用于排障），再回 OpenAI 错误结构。
   * 5xx / 429 之外的 4xx 原样透传状态码——那是客户端请求本身的问题，不该被改写。
   */
  async providerError(response: Response, _rawBody: unknown): Promise<Response> {
    const { req, candidate, config } = this
    const upstreamText = await response
      .clone()
      .text()
      .catch(() => '')
    const message =
      upstreamText.trim().slice(0, 2000) || `Upstream returned HTTP ${response.status}`

    await this.markLogFailed({
      logId: this.logId ?? '',
      attemptId: this.attemptId ?? '',
      statusCode: response.status,
      errorMessage: message,
      errorType: 'provider_error',
      retryCount: config.retryCount,
      responseTimeMs: Date.now() - req.startTime,
    })

    logger.warn(
      {
        requestId: req.requestId,
        provider: candidate.provider.name,
        statusCode: response.status,
        bodyPreview: message.slice(0, 200),
      },
      'Audio upstream returned an error response',
    )

    const clientStatus = response.status >= 500 || response.status === 429 ? 502 : response.status
    return this.config.c.json(
      {
        error: {
          type: clientStatus === 502 ? 'provider_error' : 'invalid_request_error',
          message,
          provider: candidate.provider.name,
        },
      },
      clientStatus as 400 | 404 | 429 | 502,
    )
  }

  async providerErrorPassthrough(response: Response, _rawBody: unknown): Promise<Response> {
    return this.providerError(response, _rawBody)
  }

  /**
   * 透传上游二进制/文本响应，并只记录字节数与时延。
   *
   * 不缓冲整个 body：直接转发 `response.body` 流，首字节即刻到达客户端
   * （需求 §3.2 与验收 #6）。日志在流结束后异步收尾，记录实际字节数与总耗时。
   */
  async passthroughResponse(response: Response): Promise<Response> {
    const { c, abortManager } = this.config
    const before = response.headers
    const contentType = before.get('content-type') ?? 'application/octet-stream'
    const providerHeaders: Record<string, string> = {}
    before.forEach((value, key) => {
      const lower = key.toLowerCase()
      if (lower === 'content-length' || lower === 'transfer-encoding' || lower === 'connection') {
        return
      }
      providerHeaders[lower] = value
    })
    providerHeaders['content-type'] = contentType

    for (const [key, value] of Object.entries(providerHeaders)) c.header(key, value)

    const download = fileNameFromContentDisposition(before.get('content-disposition'))
    if (download) c.header('content-disposition', before.get('content-disposition')!)

    const declaredLength = Number(before.get('content-length') ?? '')
    const startTime = this.req.startTime
    const preprocessEndTime = this.preprocessEndTime
    const ttfb = this.providerTtfbTime || Date.now()

    if (!response.body) {
      await this.finalizeSuccess({
        statusCode: response.status,
        contentType,
        bytes: Number.isFinite(declaredLength) ? declaredLength : 0,
        startTime,
        preprocessEndTime,
        ttfb,
      })
      return new Response(null, { status: response.status })
    }

    let bytes = 0
    let firstChunkAt = 0
    const source = response.body
    let finished = false
    // 转写响应是 JSON（可能含 segments）；边转发边留存一份用于提取 duration，
    // 上限 1 MB——超过就只记字节数，绝不因为观测拖慢或阻塞下行。
    const observeJson = contentType.toLowerCase().includes('json')
    const jsonChunks: Uint8Array[] = []
    let observedBytes = 0
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const reader = source.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              bytes += value.byteLength
              if (!firstChunkAt) firstChunkAt = Date.now()
              if (observeJson && observedBytes <= MAX_OBSERVED_JSON_BYTES) {
                jsonChunks.push(value)
                observedBytes += value.byteLength
              }
              controller.enqueue(value)
            }
          }
          finished = true
          controller.close()
        } catch (error) {
          logger.warn(
            { err: error, requestId: this.req.requestId },
            'Audio response stream aborted before completion',
          )
          try {
            controller.error(error)
          } catch {
            /* 客户端已断开 */
          }
        } finally {
          reader.releaseLock()
          if (finished) {
            await this.finalizeSuccess({
              statusCode: response.status,
              contentType,
              bytes: bytes || (Number.isFinite(declaredLength) ? declaredLength : 0),
              startTime,
              preprocessEndTime,
              ttfb,
              firstByteMs: firstChunkAt ? firstChunkAt - startTime : undefined,
              durationSeconds:
                observeJson && observedBytes <= MAX_OBSERVED_JSON_BYTES
                  ? extractDurationSeconds(jsonChunks)
                  : undefined,
            })
          } else {
            await this.finalizeFailure(bytes, contentType, abortManager.isClientDisconnected)
          }
        }
      },
    })

    return new Response(stream, { status: response.status, headers: providerHeaders })
  }

  /**
   * 非 HTTP 透传路径（WebSocket 会话）的成功收尾：
   * 与 `finalizeSuccess` 共用同一份日志字段，只是字节/字符数由调用方统计。
   */
  async logStreamingSuccess(params: {
    statusCode: number
    startTime: number
    outputBytes?: number
    outputChars?: number
    contentType: string
    firstByteMs?: number
  }): Promise<void> {
    await this.finalizeSuccess({
      statusCode: params.statusCode,
      contentType: params.contentType,
      bytes: params.outputBytes ?? 0,
      outputChars: params.outputChars,
      startTime: params.startTime,
      preprocessEndTime: this.preprocessEndTime,
      ttfb: this.providerTtfbTime || Date.now(),
      firstByteMs: params.firstByteMs,
      streaming: true,
    })
  }

  /** 成功收尾：只记字节数与时延，不存音频内容 */
  private async finalizeSuccess(params: {
    statusCode: number
    contentType: string
    bytes: number
    outputChars?: number
    durationSeconds?: number
    startTime: number
    preprocessEndTime: number
    ttfb: number
    firstByteMs?: number
    streaming?: boolean
  }): Promise<void> {
    const { candidate, config, req } = this

    try {
      await logRequest({
        virtualKey: req.virtualKey,
        modelName: candidate.mapping.modelName,
        originalModelName: candidate.mapping.originalModel,
        mappingType: candidate.mapping.mappingType,
        isMapped: candidate.mapping.isMapped,
        providerId: candidate.provider.id,
        providerName: candidate.provider.name,
        status: 'success',
        statusCode: params.statusCode,
        responseTimeMs: Date.now() - params.startTime,
        providerTtfbMs: Math.max(0, params.ttfb - params.preprocessEndTime),
        gatewayOverheadMs: params.preprocessEndTime - params.startTime,
        providerRequestHeaders: this.providerRequestHeaders,
        // 请求体只留结构元数据：音频字节与合成文本都不入库
        requestBody: {
          audioKind: this.upload.kind,
          audioBytes: req.uploadBytes,
          textChars: req.inputChars,
          responseFormat: req.responseFormat,
        },
        clientResponseHeaders: { 'content-type': params.contentType },
        // 响应体不落库：音频二进制与转写文本属隐私内容
        responseBody: undefined,
        audio: {
          inputBytes: req.uploadBytes,
          outputBytes: isAudioContentType(params.contentType) ? params.bytes : undefined,
          textChars: req.inputChars ?? params.outputChars,
          firstByteMs: params.firstByteMs,
          upstreamMs: params.ttfb - params.preprocessEndTime,
          durationSeconds: params.durationSeconds,
          format: req.responseFormat,
          fileName: this.upload.kind === 'multipart' ? this.upload.fileName : undefined,
        },
        clientIp: req.clientIp,
        userAgent: req.userAgent,
        clientType: req.clientType,
        requestPath: req.requestPath,
        requestMethod: req.requestMethod,
        streaming: params.streaming ?? false,
        incomingProtocol: req.incomingProtocol,
        targetProtocol: config.targetProtocol,
        logId: this.logId,
        attemptId: this.attemptId,
        retryCount: config.retryCount,
        routingTrace: {
          matchedRuleId: candidate.matchedRule?.id,
          matchedRuleName: candidate.matchedRule?.name,
          matchedRulePriority: candidate.matchedRule?.priority,
          modelGroupId: candidate.group.id,
          modelGroupName: candidate.group.name,
          instanceId: candidate.instance.id,
          actualModelName: candidate.instance.actualModelName,
          strategy: candidate.decision.strategy,
          instanceCost: candidate.instance.costPer1kTokens,
        },
      })
      // audioBytes 是本次响应字节数；requestBody.audioBytes 是上行字节数，
      // 两者语义不同，metadata 里分开记，避免读日志时混淆
      logger.info(
        {
          requestId: req.requestId,
          responseBytes: params.bytes,
          firstByteMs: params.firstByteMs,
          contentType: params.contentType,
        },
        'Audio response streamed',
      )
    } catch (error) {
      logger.warn({ err: error, requestId: req.requestId }, 'Failed to finalize audio log')
    }
  }

  private async finalizeFailure(
    bytes: number,
    contentType: string,
    clientDisconnected: boolean,
  ): Promise<void> {
    try {
      await this.markLogFailed({
        logId: this.logId ?? '',
        attemptId: this.attemptId ?? '',
        statusCode: clientDisconnected ? 499 : 502,
        errorMessage: clientDisconnected
          ? 'Client disconnected during audio response'
          : 'Audio response stream aborted by upstream',
        errorType: clientDisconnected ? 'client_disconnect' : 'stream_aborted',
        retryCount: this.config.retryCount,
        responseTimeMs: Date.now() - this.req.startTime,
      })
    } catch (error) {
      logger.warn({ err: error }, 'Failed to mark audio request failed')
    }
    logger.warn(
      { requestId: this.req.requestId, bytes, contentType, clientDisconnected },
      'Audio response stream did not complete',
    )
  }

  private get candidate(): AudioCandidateInfo {
    return this.config.candidate
  }

  private get req(): AudioRequestContext {
    return this.config.req
  }
}
