/**
 * `GET /v1/audio/stream` —— WebSocket 双向流（需求 §3.3）。
 *
 * 帧协议（JSON 控制帧 + 二进制数据帧）：
 *   C→S {"type":"start","model":"…","mode":"asr"|"tts"}
 *   C→S binary                    音频分片（ASR）
 *   C→S {"type":"commit"}         一段话说完（ASR）
 *   C→S {"type":"text","text":"…"} 待合成文本（TTS）
 *   C→S {"type":"cancel"}         打断，丢弃当前结果
 *   S→C {"type":"partial","text":"…"} 中间结果（仅上游为 WS 契约时转发）
 *   S→C {"type":"final","text":"…"}   最终结果（ASR）
 *   S→C binary                    音频分片（TTS）
 *   S→C {"type":"done"}           TTS 一批文本合成结束
 *   S→C {"type":"error","message":"…"}
 *
 * 上游有两种形态，都由 provider.protocols.<asr|tts> 描述：
 *  1. **WS 契约**（baseUrl 为 `ws://` / `wss://`）：网关做透明帧桥接，
 *     上游发什么（含 partial）就转发什么——这是 `partial` 的唯一来源。
 *  2. **HTTP 契约**（whisper-server / sherpa / 自建）：ASR 用缓冲 + commit 后
 *     调一次转录接口，TTS 每段 text 调一次合成接口并把响应字节切成 binary 帧。
 *     这类上游没有中间结果，因此只有 `final` / `done`。
 *
 * 鉴权沿用虚拟 key：Header（`Authorization` / `x-api-key`）或 `?key=`。
 * 浏览器无法给 WebSocket 设自定义头，`?key=` 是该协议的现实要求。
 */
import type { Context } from 'hono'

import type { VirtualKey } from '@xartifact/x-herald-db'
import type { providers } from '@xartifact/x-herald-db'

import logger from '../../../lib/logger'
import { accessModelRouter } from '../../services/access-model-router'
import { handleGatewayError } from '../../services/error-handler'
import { ModelNotFoundError } from '../../services/model-group-router'
import { getAudioEndpoint, getProviderUrl } from '../../services/protocol-detector'
import type { RouteResult } from '../../services/router-selector'

import { joinUrl } from '../shared/join-url'

import { AudioCandidateExecutor, type AudioUpload } from './audio-executor'
import { runAudioAttempt, type AudioAttemptResult, type AudioRequestContext } from './candidates'
import { MAX_AUDIO_BODY_BYTES } from './multipart'

type Mode = 'asr' | 'tts'
type StreamProtocol = 'asr' | 'tts'

interface StartFrame {
  type: 'start'
  model: string
  mode?: Mode
}

interface SessionState {
  virtualKey: VirtualKey
  mode: Mode | null
  protocol: StreamProtocol | null
  requestedModel: string
  candidates: RouteResult[]
  candidateIndex: number
  /** ASR 缓冲：本次 commit 之前的音频分片 */
  audioChunks: Uint8Array[]
  audioBytes: number
  /** 上游 WS 桥接 */
  upstream?: WebSocket
  upstreamQueue: string[]
  /** 中止在途 HTTP 请求（cancel / close） */
  inFlight?: AbortController
  closed: boolean
  sessionStart: number
  requestId: string
  /** TTS 期望的上游音频格式；ASR 为分片编码 */
  responseFormat: string
}

/**
 * 会话需要的 socket 能力子集。
 *
 * 用结构化类型而非 `WSContext`：Bun 适配器的 `send` 参数是 `Uint8Array<ArrayBuffer>`，
 * 而会话内部传递的是 `Uint8Array<ArrayBufferLike>`（来自 fetch 响应流），
 * 收窄到「能发字符串与字节」这一点即可两端兼容。
 */
export interface SocketSink {
  send(data: string | Uint8Array<ArrayBuffer>): void
}

const SESSION_LIMIT_BYTES = MAX_AUDIO_BODY_BYTES
const MAX_TEXT_CHARS = 32_768

function sendJson(ws: SocketSink, payload: Record<string, unknown>): void {
  try {
    ws.send(JSON.stringify(payload))
  } catch {
    /* 连接已关闭 */
  }
}

function sendError(ws: SocketSink, message: string): void {
  sendJson(ws, { type: 'error', message })
}

function isWsUrl(url: string): boolean {
  return url.startsWith('ws://') || url.startsWith('wss://')
}

/** 解析并校验一条控制帧；非法帧返回 null */
function parseFrame(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/** 从 multipart 响应/请求无关的形态构造 ASR 上行载荷 */
function buildAudioUpload(chunks: Uint8Array[], format: string): AudioUpload | { error: string } {
  const boundary = `----xherald${crypto.randomUUID().replace(/-/g, '')}`
  const encoder = new TextEncoder()
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0)
  if (total === 0) return { error: 'No audio received before commit' }

  const head = encoder.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.${format}"\r\n` +
      `Content-Type: audio/${format === 'pcm' ? 'pcm' : format}\r\n\r\n`,
  )
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`)
  const body = new Uint8Array(head.byteLength + total + tail.byteLength)
  body.set(head, 0)
  let offset = head.byteLength
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  body.set(tail, offset)

  return {
    kind: 'multipart',
    contentType: `multipart/form-data; boundary=${boundary}`,
    body,
    fileName: `audio.${format}`,
    bytes: total,
  }
}

/**
 * 会话级路由解析：按 mode 选类别（asr/tts），返回该组全部候选。
 * 与 HTTP 端点共用 accessModelRouter，规则/意图/能力路由对 WS 同样生效。
 */
async function resolveCandidates(virtualKey: VirtualKey, model: string, protocol: StreamProtocol) {
  const requestGroupId = crypto.randomUUID()
  const candidates = await accessModelRouter.routeCandidates({
    requestedModel: model,
    streaming: true,
    hasTools: false,
    hasVision: false,
    virtualKeyId: virtualKey.id,
    workspaceId: virtualKey.workspaceId,
    requestGroupId,
  })
  const filtered = candidates.filter((cd) => cd.group.category === protocol)
  if (filtered.length === 0) throw new ModelNotFoundError(model)
  return { candidates: filtered, requestGroupId }
}

function candidateProtocolUrl(
  provider: typeof providers.$inferSelect,
  protocol: StreamProtocol,
): string | null {
  const url = getProviderUrl(provider, protocol)
  return url
}

/**
 * 向上游转发一帧。
 *
 * 上游 WS 只有 `OPEN` 后才可发送；握手未完成时直接 `send` 会抛错并可能中断
 * 整个会话，因此先入队，由 `open` 事件统一冲刷。
 */
function sendUpstream(state: SessionState, frame: string | Uint8Array<ArrayBuffer>): void {
  const upstream = state.upstream
  // 队列只承载控制帧文本：二进制分片若在握手前到达，重放会改变时序，
  // 直接丢弃（真实会话总是 start 后才发音频，握手通常已完成）。
  if (typeof frame === 'string' && upstream?.readyState !== WebSocket.OPEN) {
    state.upstreamQueue.push(frame)
    return
  }
  if (!upstream || upstream.readyState !== WebSocket.OPEN) return
  try {
    upstream.send(frame)
  } catch (error) {
    logger.warn({ err: error, requestId: state.requestId }, 'Failed to forward frame upstream')
  }
}

/** 上游 WS 桥接：网关只做帧转发与生命周期，不改协议语义 */
function openUpstreamWs(ws: SocketSink, state: SessionState, url: string): void {
  const frames = state.upstreamQueue
  let upstream: WebSocket
  try {
    upstream = new WebSocket(url)
  } catch (error) {
    logger.warn({ err: error, url }, 'Failed to open upstream audio WebSocket')
    sendError(ws, 'Failed to connect upstream audio stream')
    return
  }
  state.upstream = upstream
  upstream.binaryType = 'arraybuffer'

  upstream.addEventListener('open', () => {
    for (const frame of frames) {
      try {
        upstream.send(frame)
      } catch {
        // 握手后立即关闭的上游：丢弃队列，由 close 事件统一告知客户端
      }
    }
    frames.length = 0
  })

  upstream.addEventListener('message', (event) => {
    const data = event.data
    if (typeof data === 'string') {
      ws.send(data)
      return
    }
    if (data instanceof ArrayBuffer) {
      ws.send(new Uint8Array(data))
      return
    }
    if (data instanceof Uint8Array) {
      // 复制到独立的 ArrayBuffer 上：上游 Buffer 可能被复用，且类型上是 ArrayBufferLike
      ws.send(new Uint8Array(data))
    }
  })
  upstream.addEventListener('close', () => {
    if (!state.closed) sendJson(ws, { type: 'done' })
  })
  upstream.addEventListener('error', () => {
    if (!state.closed) sendError(ws, 'Upstream audio stream error')
  })
}

/**
 * WS 会话内的单次候选调用：HTTP 契约才走；WS 契约在这之前已被桥接。
 * 复用 HTTP 端点的 `runAudioAttempt`，区别只是信号来自会话级 controller。
 */
async function runSessionAttempt(
  c: Context,
  state: SessionState,
  protocol: StreamProtocol,
  requestGroupId: string,
  signal: AbortSignal,
  upload: AudioUpload,
): Promise<AudioAttemptResult> {
  const req: AudioRequestContext = {
    c,
    virtualKey: state.virtualKey,
    requestedModel: state.requestedModel,
    // WS 客户端不能带 HTTP 头；上游鉴权走 provider 的 apiKey
    clientRequestHeaders: {},
    clientIp: 'ws',
    userAgent: 'websocket',
    requestPath: c.req.path,
    requestMethod: 'GET',
    requestId: state.requestId,
    startTime: Date.now(),
    uploadBytes: upload.kind === 'multipart' ? upload.bytes : undefined,
    inputChars: upload.kind === 'json' ? upload.inputChars : undefined,
    responseFormat: state.responseFormat,
  }
  const usable = state.candidates.filter((candidate) => {
    const url = candidateProtocolUrl(candidate.provider, protocol)
    return url !== null && !isWsUrl(url)
  })
  for (let i = 0; i < usable.length; i++) {
    const attempt = await runAudioAttempt({
      req,
      candidate: usable[i],
      candidateIndex: i,
      protocol,
      requestGroupId,
      // model 由 runAudioAttempt 按候选实例绑定（JSON 载荷统一处理）
      upload,
      signal,
      isLastCandidate: i === usable.length - 1,
      retryConfig: {
        maxRetries: 1,
        baseDelay: 300,
        maxDelay: 5_000,
        retryableStatusCodes: [429, 500, 502, 503, 504],
      },
    })
    if (attempt.outcome === 'ok' || attempt.outcome === 'error' || attempt.outcome === 'aborted') {
      return attempt
    }
  }
  // 没有 HTTP 契约的候选：交给调用方报错
  return {
    outcome: 'skipped',
    executor: undefined as unknown as AudioCandidateExecutor,
  }
}

async function handleAsrCommit(
  c: Context,
  ws: SocketSink,
  state: SessionState,
  format: string,
  requestGroupId: string,
): Promise<void> {
  if (state.upstream) {
    sendUpstream(state, JSON.stringify({ type: 'commit' }))
    return
  }

  const encoded = buildAudioUpload(state.audioChunks, format)
  if ('error' in encoded) {
    sendError(ws, encoded.error)
    return
  }
  state.audioChunks = []
  state.audioBytes = 0

  const controller = new AbortController()
  state.inFlight = controller
  try {
    const attempt = await runSessionAttempt(
      c,
      state,
      'asr',
      requestGroupId,
      controller.signal,
      encoded,
    )
    if (attempt.outcome !== 'ok') {
      sendError(ws, 'Transcription upstream failed')
      return
    }

    const response = attempt.response!
    const bodyText = await response.text()
    const contentType = response.headers.get('content-type') ?? ''
    const text = extractTranscriptText(bodyText, contentType)
    await attempt.executor.logStreamingSuccess({
      statusCode: response.status,
      startTime: Date.now(),
      outputChars: text.length,
      contentType,
    })
    sendJson(ws, { type: 'final', text })
  } finally {
    state.inFlight = undefined
  }
}

/** 从转写响应里取文本：JSON 取 `text`，其余按纯文本转发 */
function extractTranscriptText(bodyText: string, contentType: string): string {
  if (!contentType.includes('json')) return bodyText
  try {
    const parsed: unknown = JSON.parse(bodyText)
    if (parsed && typeof parsed === 'object' && 'text' in parsed) {
      const value = parsed.text
      if (typeof value === 'string') return value
    }
  } catch {
    /* 非 JSON：按纯文本转发 */
  }
  return bodyText
}

async function handleTtsText(
  c: Context,
  ws: SocketSink,
  state: SessionState,
  text: string,
  responseFormat: string,
  requestGroupId: string,
): Promise<void> {
  if (state.upstream) {
    sendUpstream(state, JSON.stringify({ type: 'text', text }))
    return
  }
  if (text.length > MAX_TEXT_CHARS) {
    sendError(ws, `Text too long: limit is ${MAX_TEXT_CHARS} characters per frame`)
    return
  }

  const controller = new AbortController()
  state.inFlight = controller
  try {
    // model 由 runAudioAttempt 按候选实例绑定，这里只给文本与格式
    const attempt = await runSessionAttempt(c, state, 'tts', requestGroupId, controller.signal, {
      kind: 'json',
      body: JSON.stringify({ input: text, response_format: responseFormat }),
      inputChars: text.length,
    })
    if (attempt.outcome !== 'ok') {
      sendError(ws, 'Speech upstream failed')
      return
    }

    const response = attempt.response!
    const reader = response.body?.getReader()
    let bytes = 0
    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        bytes += value.byteLength
        if (state.closed) {
          // 会话已关闭：显式取消，避免上游连接悬空
          await reader.cancel().catch(() => {})
          break
        }
        ws.send(new Uint8Array(value))
      }
    }
    await attempt.executor.logStreamingSuccess({
      statusCode: response.status,
      startTime: Date.now(),
      outputBytes: bytes,
      contentType: response.headers.get('content-type') ?? '',
    })
    sendJson(ws, { type: 'done' })
  } finally {
    state.inFlight = undefined
  }
}

/**
 * 建立会话并返回事件处理器。
 *
 * 状态全部挂在这个闭包里：每条连接一份，不共享可变全局（并发会话互不影响）。
 */
export function createAudioStreamHandlers(c: Context) {
  const state: SessionState = {
    virtualKey: c.get('virtualKey') as VirtualKey,
    mode: null,
    protocol: null,
    requestedModel: '',
    candidates: [],
    candidateIndex: 0,
    audioChunks: [],
    audioBytes: 0,
    upstreamQueue: [],
    closed: false,
    sessionStart: Date.now(),
    requestId: c.get('requestId') ?? crypto.randomUUID(),
    responseFormat: 'wav',
  }
  let requestGroupId = ''

  return {
    async onStart(ws: SocketSink, frame: StartFrame): Promise<boolean> {
      const model = frame.model
      if (typeof model !== 'string' || !model) {
        sendError(ws, 'start frame requires "model"')
        return false
      }
      const mode: Mode = frame.mode === 'tts' ? 'tts' : 'asr'
      try {
        const resolved = await resolveCandidates(state.virtualKey, model, mode)
        state.mode = mode
        state.protocol = mode
        state.requestedModel = model
        state.candidates = resolved.candidates
        state.candidateIndex = 0
        requestGroupId = resolved.requestGroupId
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        sendError(ws, message)
        return false
      }

      const provider = state.candidates[0]?.provider
      const providerUrl = provider ? candidateProtocolUrl(provider, state.protocol) : null
      if (providerUrl && isWsUrl(providerUrl)) {
        const url = joinUrl(providerUrl, getAudioEndpoint(provider!, state.protocol))
        openUpstreamWs(ws, state, url)
      }
      return true
    },

    async onCommit(ws: SocketSink, format: string): Promise<void> {
      if (state.mode !== 'asr') {
        sendError(ws, 'commit is only valid in asr mode')
        return
      }
      if (state.upstream) {
        sendUpstream(state, JSON.stringify({ type: 'commit' }))
        return
      }
      await handleAsrCommit(c, ws, state, format, requestGroupId)
    },

    async onText(ws: SocketSink, text: string, format: string): Promise<void> {
      if (state.mode !== 'tts') {
        sendError(ws, 'text is only valid in tts mode')
        return
      }
      if (state.upstream) {
        sendUpstream(state, JSON.stringify({ type: 'text', text }))
        return
      }
      // 帧里的 format 决定本次期望的音频格式（客户端可能逐句切换，如 wav → pcm）
      state.responseFormat = format
      await handleTtsText(c, ws, state, text, format, requestGroupId)
    },

    onBinary(ws: SocketSink, chunk: Uint8Array): void {
      if (state.mode !== 'asr') {
        sendError(ws, 'binary frames are only valid in asr mode')
        return
      }
      if (state.upstream) {
        sendUpstream(state, new Uint8Array(chunk))
        return
      }
      state.audioBytes += chunk.byteLength
      if (state.audioBytes > SESSION_LIMIT_BYTES) {
        state.audioChunks = []
        state.audioBytes = 0
        sendError(
          ws,
          `Audio exceeds session buffer limit (${Math.round(SESSION_LIMIT_BYTES / (1024 * 1024))} MB); send commit sooner`,
        )
        return
      }
      state.audioChunks.push(chunk)
    },

    onCancel(): void {
      state.audioChunks = []
      state.audioBytes = 0
      state.inFlight?.abort()
      state.inFlight = undefined
      if (state.upstream) sendUpstream(state, JSON.stringify({ type: 'cancel' }))
    },

    onClose(): void {
      state.closed = true
      state.audioChunks = []
      state.audioBytes = 0
      state.inFlight?.abort()
      try {
        state.upstream?.close()
      } catch {
        /* 已关闭 */
      }
      logger.info(
        {
          requestId: c.get('requestId'),
          mode: state.mode,
          model: state.requestedModel,
          durationMs: Date.now() - state.sessionStart,
        },
        'Audio stream session closed',
      )
    },
  }
}

/** 供路由层调用的兜底错误响应（非 WebSocket 环境） */
export function audioStreamUnavailable(c: Context, message: string): Promise<Response> {
  const virtualKey = c.get('virtualKey') as VirtualKey
  return Promise.resolve(c.json({ error: { type: 'invalid_request_error', message } }, 400)).then(
    (fallback) =>
      virtualKey
        ? fallback
        : handleGatewayError({
            error: new Error(message),
            c,
            virtualKey,
            requestHeaders: {},
            clientIp: 'ws',
            userAgent: c.req.header('user-agent') || 'unknown',
            requestPath: c.req.path,
            requestMethod: c.req.method,
            isStreaming: false,
            startTime: Date.now(),
            incomingProtocol: 'openai',
            targetProtocol: 'asr',
            logId: undefined,
            retryCount: 0,
          }),
  )
}

export { parseFrame }
