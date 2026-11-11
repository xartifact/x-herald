import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/bun'

import type { VirtualKey } from '@xartifact/x-herald-db'

import { createAudioStreamHandlers, parseFrame } from '../handlers/audio/stream-session'

const audioStreamRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey
  }
}>()

const AUDIO_FORMAT_PATTERN = /^[a-z0-9]{1,8}$/

/**
 * `GET /v1/audio/stream`（WebSocket 升级）。
 *
 * 帧协议见 `handlers/audio/stream-session.ts`。这里只做「帧 → 会话方法」的分派：
 * 状态全部在 `createAudioStreamHandlers(c)` 的闭包里，一条连接一份，不共享全局。
 *
 * 非升级请求（普通 GET / curl）由后续 handler 明确回 426，而不是落 SPA 兜底 HTML。
 */
audioStreamRoutes.get(
  '/audio/stream',
  upgradeWebSocket((c) => {
    const session = createAudioStreamHandlers(c)
    /** 上行未指定音频格式时的分片编码（默认 16 kHz mono PCM，需求 §3.3） */
    let binaryFormat = 'pcm'

    const sendError = (ws: { send: (d: string) => void }, message: string) =>
      ws.send(JSON.stringify({ type: 'error', message }))

    return {
      async onMessage(event, ws) {
        const data = event.data
        if (typeof data === 'string') {
          const frame = parseFrame(data)
          if (!frame) {
            sendError(ws, 'Invalid JSON frame')
            return
          }
          const type = frame.type
          if (type === 'start') {
            const format = frame.format
            if (typeof format === 'string' && AUDIO_FORMAT_PATTERN.test(format)) {
              binaryFormat = format
            }
            await session.onStart(ws, {
              type: 'start',
              model: String(frame.model ?? ''),
              mode: frame.mode === 'tts' ? 'tts' : 'asr',
            })
            return
          }
          if (type === 'commit') {
            await session.onCommit(ws, binaryFormat)
            return
          }
          if (type === 'text') {
            const text = typeof frame.text === 'string' ? frame.text : ''
            const format = typeof frame.format === 'string' ? frame.format : 'wav'
            await session.onText(ws, text, format)
            return
          }
          if (type === 'cancel') {
            session.onCancel()
            return
          }
          sendError(ws, `Unknown frame type: ${String(type)}`)
          return
        }

        const binary =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : data instanceof Uint8Array
              ? data
              : null
        if (!binary) {
          sendError(ws, 'Unsupported binary frame')
          return
        }
        session.onBinary(ws, binary)
      },
      onClose() {
        session.onClose()
      },
      onError() {
        session.onClose()
      },
    }
  }),
  (c) =>
    c.json(
      {
        error: {
          type: 'invalid_request_error',
          message: 'This endpoint requires a WebSocket upgrade (GET /v1/audio/stream)',
        },
      },
      426,
    ),
)

export default audioStreamRoutes
