/**
 * 音频候选遍历（ASR / TTS 共用）。
 *
 * 转录与合成只在「上行载荷如何构造」和「成功响应如何处理」两点上不同：
 * 候选循环、协议端点解析、失败/断连/failover 归类、日志落库完全一致。
 * 把循环抽到这里，两个 handler 各自只剩校验与协议细节，避免三份拷贝漂移。
 */
import type { Context } from 'hono'

import type { VirtualKey } from '@xartifact/x-herald-db'

import logger from '../../../lib/logger'
import { markStreamAborted } from '../../services/log-service'
import { getAudioEndpoint, getProviderUrl } from '../../services/protocol-detector'
import type { RouteResult } from '../../services/router-selector'
import { AbortManager } from '../shared/abort-manager'
import { executeFailoverIteration } from '../shared/failover-executor'

import { AudioCandidateExecutor, type AudioUpload } from './audio-executor'
import { openAIError } from './errors'

export type AudioProtocol = 'asr' | 'tts'

export interface AudioRequestContext {
  c: Context
  virtualKey: VirtualKey
  requestedModel: string
  clientRequestHeaders: Record<string, string>
  clientIp: string
  userAgent: string
  clientType?: string
  requestPath: string
  requestMethod: string
  requestId: string
  startTime: number
  responseFormat?: string
  /** 上行音频字节数（ASR）/ 文本字符数（TTS），仅供日志 */
  uploadBytes?: number
  inputChars?: number
}

export interface RunAudioCandidatesParams {
  req: AudioRequestContext
  candidates: RouteResult[]
  protocol: AudioProtocol
  requestGroupId: string
  /**
   * 构造上行载荷。JSON 载荷的 `model` 由 `runAudioAttempt` 按候选绑定；
   * multipart 必须在这里就按候选改写（按 boundary 定位字段），因此会收到实机模型名。
   */
  buildUpload: (actualModelName: string) => AudioUpload
  /** 成功响应处理：透传流或解析后回帧 */
  onSuccess: (executor: AudioCandidateExecutor, response: Response) => Promise<Response>
}

/**
 * 把载荷里的 model 换成目标实例的实机模型名。
 *
 * multipart 由调用方按候选改写（需要按 boundary 定位字段），JSON 在这里统一重写。
 */
function bindUploadModel(upload: AudioUpload, actualModelName: string): AudioUpload {
  if (upload.kind !== 'json') return upload
  const parsed = JSON.parse(upload.body) as Record<string, unknown>
  return { ...upload, body: JSON.stringify({ ...parsed, model: actualModelName }) }
}

export interface AudioAttemptParams {
  req: AudioRequestContext
  candidate: RouteResult
  candidateIndex: number
  protocol: AudioProtocol
  requestGroupId: string
  upload: AudioUpload
  /** 中止信号来源（WS 会话用会话级 controller；HTTP 用请求 signal） */
  signal: AbortSignal
  isLastCandidate: boolean
  retryConfig?: {
    maxRetries: number
    baseDelay: number
    maxDelay: number
    retryableStatusCodes: number[]
  }
}

export interface AudioAttemptResult {
  /** `ok` = 拿到可用响应；`failover` = 应换下一个候选；`aborted` = 客户端/会话中止 */
  outcome: 'ok' | 'failover' | 'aborted' | 'error' | 'skipped'
  response?: Response
  executor: AudioCandidateExecutor
}

/**
 * 对**单个**候选实例执行一次音频上游调用。
 *
 * HTTP 端点的候选循环与 WS 会话的帧处理都需要「一个候选一次调用」，区别只在外层
 * 如何组织循环与如何消费响应；把这次调用抽出来，避免两处各写一份 failover 装配。
 */
export async function runAudioAttempt(params: AudioAttemptParams): Promise<AudioAttemptResult> {
  const { req, candidate, candidateIndex, protocol, requestGroupId, upload, signal } = params
  const { instance, provider, group, decision, mapping } = candidate
  const { c, requestId, startTime } = req

  const abortManager = new AbortManager(signal)
  abortManager.registerClientDisconnect()
  const providerUrl = getProviderUrl(provider, protocol)
  // 上行载荷里的 model 必须是目标实例的实机模型名：调用方可能只构造了与候选无关的
  // 骨架载荷（WS 会话），统一在这里绑定，避免每个调用方各写一遍。
  const boundUpload = bindUploadModel(upload, instance.actualModelName)
  const executor = new AudioCandidateExecutor(
    {
      c,
      candidate: {
        instance,
        provider,
        group,
        matchedRule: candidate.matchedRule,
        mapping,
        decision,
      },
      req: {
        virtualKey: req.virtualKey,
        clientRequestHeaders: req.clientRequestHeaders,
        clientIp: req.clientIp,
        userAgent: req.userAgent,
        clientType: req.clientType,
        requestPath: req.requestPath,
        requestMethod: req.requestMethod,
        incomingProtocol: 'openai',
        startTime,
        requestId,
        requestedModel: req.requestedModel,
        uploadBytes: req.uploadBytes,
        inputChars: req.inputChars,
        responseFormat: req.responseFormat,
      },
      abortManager,
      providerUrl: providerUrl ?? '',
      endpoint: getAudioEndpoint(provider, protocol),
      targetProtocol: protocol,
      retryCount: 0,
      requestGroupId,
      candidateIndex,
    },
    boundUpload,
  )

  if (!providerUrl) {
    // 该候选未配置音频协议：不是失败也不是成功，交给调用方决定是否继续
    abortManager.dispose()
    return { outcome: 'skipped', executor }
  }

  try {
    const result = await executeFailoverIteration({
      c,
      abortManager,
      isStreaming: false,
      isLastCandidate: params.isLastCandidate,
      requestId,
      providerName: provider.name,
      instanceName: instance.name,
      modelName: instance.actualModelName,
      startTime,
      getLogId: () => executor.logId,
      getAttemptId: () => executor.attemptId,
      getPreprocessEndTime: () => executor.preprocessEndTime,
      clientIp: req.clientIp,
      userAgent: req.userAgent,
      requestPath: req.requestPath,
      requestMethod: req.requestMethod,
      rawBody: { model: req.requestedModel },
      retryConfig: params.retryConfig ?? {
        maxRetries: instance.config?.retryConfig?.maxRetries ?? 2,
        baseDelay: instance.config?.retryConfig?.retryDelay ?? 500,
        maxDelay: 30_000,
        retryableStatusCodes: instance.config?.retryConfig?.retryableStatusCodes ?? [
          429, 500, 502, 503, 504, 521, 524,
        ],
      },
      onPrepareRequest: () => executor.prepareRequest(),
      onBeforeFetch: () => executor.beforeFetch(),
      onRetry: (a, d, r) => executor.retry(a, d, r),
      onRecordFailure: () => executor.recordFailure(),
      onRecordSuccess: () => executor.recordSuccess(),
      onMarkLogAsFailed: (p) => executor.markLogFailed(p),
      onLogEventBusEmitAborted: (id) => executor.emitAbortedEvent(id),
      handleGatewayError: (code, msg) => executor.gatewayError(code, msg),
      handleProviderError: (resp, rb) => executor.providerError(resp, rb),
      handleProviderErrorPassthrough: (resp, rb) => executor.providerErrorPassthrough(resp, rb),
      expectsNonJsonResponse: true,
    })

    if (result.type === 'abort') {
      if (result.aborted === 'client_disconnect') {
        logger.info({ requestId, protocol }, 'Client disconnected during audio request')
        if (executor.logId) {
          await markStreamAborted(executor.logId, executor.attemptId ?? '', false, {
            forceCancelled: true,
            isStreaming: false,
            responseTimeMs: Date.now() - startTime,
          })
        }
      }
      return { outcome: 'aborted', executor }
    }
    if (result.type === 'failover') {
      logger.warn(
        { requestId, protocol, instanceId: instance.id, statusCode: result.response?.status },
        '[Audio Failover] Instance failed, switching to next candidate',
      )
      return { outcome: 'failover', executor }
    }
    if (result.type === 'error') return { outcome: 'error', response: result.response, executor }

    executor.providerTtfbTime = Date.now()
    return { outcome: 'ok', response: result.response, executor }
  } finally {
    abortManager.dispose()
  }
}

/**
 * 顺序尝试候选实例，返回最终对客户端的响应。
 *
 * 语义与 chat/embedding 一致：协议未配置时跳过（非最后一枚则继续 failover）、
 * 失败按现有熔断与重试策略处理、客户端断连记为 cancelled 并回 499。
 */
export async function runAudioCandidates(params: RunAudioCandidatesParams): Promise<Response> {
  const { req, candidates, protocol, requestGroupId, buildUpload, onSuccess } = params
  const { c } = req

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]
    const attempt = await runAudioAttempt({
      req,
      candidate,
      candidateIndex: i,
      protocol,
      requestGroupId,
      upload: buildUpload(candidate.instance.actualModelName),
      signal: c.req.raw.signal,
      isLastCandidate: i === candidates.length - 1,
    })

    if (attempt.outcome === 'ok') {
      return onSuccess(attempt.executor, attempt.response!)
    }
    if (attempt.outcome === 'aborted') {
      return attempt.executor.gatewayError('aborted', 'Request aborted')
    }
    if (attempt.outcome === 'error') return attempt.response!
    // failover / skipped：该实例失败或未配置音频协议，尝试下一个候选
  }

  const last = candidates[candidates.length - 1]
  return openAIError(
    'protocol_error',
    `Protocol '${protocol}' is not configured on candidate provider '${last?.provider.name ?? 'unknown'}'`,
    400,
  )
}
