/**
 * `POST /v1/audio/transcriptions` —— OpenAI 兼容语音转文字。
 *
 * 透明代理原则下的做法：
 *  - 上行 multipart 只改写 `model` 字段（目标实例实际模型名），其余字节原样转发；
 *  - 路由、虚拟密钥、熔断、重试、failover、错误映射复用现有链路（见 `candidates.ts`）；
 *  - 下行按上游 `content-type` 直接透传（JSON / text / verbose_json），不重新序列化，
 *    因而上游新增字段（segments、words…）无需网关跟进。
 *
 * 与 embedding 的差别只在载荷形态：这里必须拿到完整字节才能改写 multipart，
 * 因此 25 MB 上限在读取前用 content-length 预判，超限直接 413。
 */
import type { Context } from 'hono'

import type { VirtualKey } from '@xartifact/x-herald-db'

import logger from '../../../lib/logger'
import { accessModelRouter } from '../../services/access-model-router'
import { identifyClient, resolveClientIp } from '../../services/client-identifier'
import { handleGatewayError } from '../../services/error-handler'
import { ModelNotFoundError } from '../../services/model-group-router'

import { runAudioCandidates } from './candidates'
import { openAIError } from './errors'
import {
  MAX_AUDIO_BODY_BYTES,
  inspectMultipart,
  parseBoundary,
  readBodyWithLimit,
  rewriteMultipartField,
} from './multipart'

const ASR_CATEGORY = 'asr'
const ASR_PROTOCOL = 'asr'
const MAX_AUDIO_MB = Math.round(MAX_AUDIO_BODY_BYTES / (1024 * 1024))

export async function handleAudioTranscription(c: Context): Promise<Response> {
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

  try {
    const contentType = c.req.header('content-type') ?? ''
    const boundary = parseBoundary(contentType)
    if (!boundary) {
      return openAIError(
        'invalid_request_error',
        'Audio transcription requires multipart/form-data with a "file" part',
        400,
      )
    }

    const declaredLength = Number(c.req.header('content-length') ?? '')
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BODY_BYTES) {
      return openAIError(
        'invalid_request_error',
        `Audio file too large: limit is ${MAX_AUDIO_MB} MB`,
        413,
      )
    }

    const bytes = await readBodyWithLimit(c.req.raw)
    if (!bytes) {
      return openAIError(
        'invalid_request_error',
        `Audio file too large: limit is ${MAX_AUDIO_MB} MB`,
        413,
      )
    }

    const inspected = inspectMultipart(bytes, boundary)
    if ('error' in inspected) {
      return openAIError('invalid_request_error', inspected.error, 400)
    }

    const model = inspected.fields.model
    if (typeof model !== 'string' || !model) {
      return openAIError('invalid_request_error', 'Missing required field: model', 400)
    }
    if (!inspected.hasFile) {
      return openAIError('invalid_request_error', 'Missing required field: file', 400)
    }

    const filePart = inspected.parts.find((p) => p.name === 'file' && p.filename !== undefined)
    const uploadBytes = filePart?.size
    const fileName = filePart?.filename
    // 保留客户端原始 content-type（含 boundary 与 charset）；缺省时按 boundary 重建
    const originalContentType = contentType || `multipart/form-data; boundary=${boundary}`

    logger.info(
      { requestId, model, bytes: uploadBytes, protocol: ASR_PROTOCOL },
      'Processing audio transcription request',
    )

    if (virtualKey.allowedModels?.length && !virtualKey.allowedModels.includes(model)) {
      // 需求 §3.1 / §6 #4：模型不在 allowedModels → 404（与「不存在」同语义，
      // 不向调用方泄漏密钥的模型目录构成）
      return openAIError(
        'not_found_error',
        `The model '${model}' does not exist or is not available for this API key`,
        404,
      )
    }

    const requestGroupId = crypto.randomUUID()
    const candidates = await accessModelRouter.routeCandidates({
      requestedModel: model,
      streaming: false,
      hasTools: false,
      hasVision: false,
      virtualKeyId: virtualKey.id,
      workspaceId: virtualKey.workspaceId,
      requestGroupId,
    })
    const asrCandidates = candidates.filter((cd) => cd.group.category === ASR_CATEGORY)
    if (asrCandidates.length === 0) throw new ModelNotFoundError(model)

    return await runAudioCandidates({
      req: {
        c,
        virtualKey,
        requestedModel: model,
        clientRequestHeaders,
        clientIp,
        userAgent,
        clientType: clientInfo.type,
        requestPath,
        requestMethod,
        requestId,
        startTime,
        uploadBytes,
        responseFormat: inspected.fields.response_format,
      },
      candidates: asrCandidates,
      protocol: ASR_PROTOCOL,
      requestGroupId,
      buildUpload: (actualModelName) => {
        const rewritten = rewriteMultipartField(bytes, boundary, 'model', actualModelName)
        if ('error' in rewritten) throw new Error(rewritten.error)
        return {
          kind: 'multipart',
          contentType: originalContentType,
          body: rewritten.body,
          fileName,
          bytes: rewritten.body.byteLength,
        }
      },
      onSuccess: (executor, response) => executor.passthroughResponse(response),
    })
  } catch (error) {
    logger.error({ error, requestId }, 'Audio transcription gateway error')
    return handleGatewayError({
      error: error instanceof Error ? error : new Error(String(error)),
      c,
      virtualKey,
      requestHeaders: clientRequestHeaders,
      providerRequestHeaders: undefined,
      clientIp,
      userAgent,
      clientType: clientInfo.type,
      requestPath,
      requestMethod,
      isStreaming: false,
      startTime,
      transformedBody: undefined,
      incomingProtocol: 'openai',
      targetProtocol: ASR_PROTOCOL,
      logId: undefined,
      retryCount: 0,
    })
  }
}
