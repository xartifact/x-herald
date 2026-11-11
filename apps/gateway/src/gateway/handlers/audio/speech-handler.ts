/**
 * `POST /v1/audio/speech` —— OpenAI 兼容文字转语音。
 *
 * 与转录的区别：上行是 JSON，下行是**二进制音频**。两条要求决定了实现形状：
 *  - 响应必须流式透传、不整体缓冲，否则长文本首字节延迟不可接受（需求 §3.2 / #6）；
 *  - 上游可能返回 `application/octet-stream`、`audio/wav`、`audio/mpeg` 等，
 *    网关不解析 body，按上游 `content-type` 原样转发。
 *
 * 候选遍历、failover 与失败归类在 `candidates.ts`；这里只做参数校验与载荷构造。
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

const TTS_CATEGORY = 'tts'
const TTS_PROTOCOL = 'tts'
/** 合成长文本的推荐上限（需求 §3.2）；超出不拒绝，只记日志便于运维发现异常调用 */
const RECOMMENDED_MAX_INPUT_CHARS = 4096

const DEFAULT_AUDIO_CONTENT_TYPE: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  pcm: 'audio/pcm',
  opus: 'audio/opus',
  aac: 'audio/aac',
  flac: 'audio/flac',
}

export async function handleAudioSpeech(c: Context): Promise<Response> {
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
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return openAIError('invalid_request_error', 'Request body must be valid JSON', 400)
    }

    const model = body.model
    const input = body.input
    if (typeof model !== 'string' || !model) {
      return openAIError('invalid_request_error', 'Missing required field: model', 400)
    }
    if (typeof input !== 'string' || input.length === 0) {
      return openAIError('invalid_request_error', 'Missing required field: input', 400)
    }
    const responseFormat = typeof body.response_format === 'string' ? body.response_format : 'wav'

    if (input.length > RECOMMENDED_MAX_INPUT_CHARS) {
      logger.info(
        { requestId, chars: input.length, limit: RECOMMENDED_MAX_INPUT_CHARS },
        'TTS input exceeds recommended length; forwarding as-is',
      )
    }

    if (virtualKey.allowedModels?.length && !virtualKey.allowedModels.includes(model)) {
      // 需求 §3.2 / §6 #4：模型不在 allowedModels → 404
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
    const ttsCandidates = candidates.filter((cd) => cd.group.category === TTS_CATEGORY)
    if (ttsCandidates.length === 0) throw new ModelNotFoundError(model)

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
        inputChars: input.length,
        responseFormat,
      },
      candidates: ttsCandidates,
      protocol: TTS_PROTOCOL,
      requestGroupId,
      // 保留客户端全部字段（speed / voice / instructions…）；model 由 runAudioAttempt
      // 按候选实例绑定。语音上游的自有参数不应被网关裁剪，透明代理优先。
      buildUpload: () => ({
        kind: 'json',
        body: JSON.stringify(body),
        inputChars: input.length,
      }),
      onSuccess: (executor, response) => {
        // 上游未声明 content-type 时按客户端请求的格式补齐，否则浏览器无法播放
        if (!response.headers.get('content-type')) {
          c.header(
            'content-type',
            DEFAULT_AUDIO_CONTENT_TYPE[responseFormat] ?? 'application/octet-stream',
          )
        }
        return executor.passthroughResponse(response)
      },
    })
  } catch (error) {
    logger.error({ error, requestId }, 'Audio speech gateway error')
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
      incomingProtocol: 'openai',
      targetProtocol: TTS_PROTOCOL,
      logId: undefined,
      retryCount: 0,
    })
  }
}
