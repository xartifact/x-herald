/**
 * 音频端点真实 socket 冒烟：起一个真实的 Bun.serve 网关，验证
 *  1. `Bun.serve` + `hono/bun` 的 websocket 处理器能被装配（WS 升级真的成功）；
 *  2. 控制帧在真实连接上被解析并回 error 帧（无 DB 环境，路由解析必然失败 → 明确报错）；
 *  3. 非升级 GET 返回 426，而不是 SPA 的 HTML。
 *
 * 与 `__tests__/audio.test.ts` 的分工：那组走 Hono `app.request`（不经过 Bun.serve），
 * 覆盖完整 DB 链路与日志；这组专门验证服务端装配与真实 socket。
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { Hono } from 'hono'
import { websocket } from 'hono/bun'

import { createAudioStreamHandlers, parseFrame } from '../gateway/handlers/audio/stream-session'
import audioRoutes from '../gateway/routes/audio'
import audioStreamRoutes from '../gateway/routes/audio-stream'

interface SmokeKey {
  id: string
  name: string
  key: string
  workspaceId: string
  allowedModels: string[] | null
}

/** 最小 app：只挂音频路由，虚拟 key 直接注入（跳过 DB 鉴权） */
function buildApp(): Hono<{ Variables: { virtualKey: SmokeKey } }> {
  const app = new Hono<{ Variables: { virtualKey: SmokeKey } }>()
  app.use('*', async (c, next) => {
    c.set('virtualKey', {
      id: crypto.randomUUID(),
      name: 'smoke-key',
      key: 'sk-smoke',
      workspaceId: '00000000-0000-0000-0000-000000000001',
      allowedModels: null,
    })
    await next()
  })
  app.route('/api/v1', audioRoutes)
  app.route('/api/v1', audioStreamRoutes)
  return app
}

/**
 * 等一条 WS 消息。
 *
 * 定时器只作死锁护栏（socket 永不回包时让测试以超时失败而不是挂住），
 * 正常路径由 `message` 事件驱动，不依赖时长。
 */
function nextMessage(ws: WebSocket, timeoutMs = 5_000): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>()
  const timer = setTimeout(() => reject(new Error('timeout waiting for ws message')), timeoutMs)
  ws.addEventListener(
    'message',
    (event) => {
      clearTimeout(timer)
      resolve(typeof event.data === 'string' ? event.data : '[binary]')
    },
    { once: true },
  )
  return promise
}

describe('audio endpoints over real Bun.serve', () => {
  let server: ReturnType<typeof Bun.serve>
  let baseUrl: string

  beforeAll(() => {
    const app = buildApp()
    server = Bun.serve({ port: 0, fetch: app.fetch, websocket, idleTimeout: 0 })
    baseUrl = `http://localhost:${server.port}`
  })

  afterAll(() => {
    server.stop(true)
  })

  it('rejects a plain GET on the stream endpoint with 426 JSON', async () => {
    const res = await fetch(`${baseUrl}/api/v1/audio/stream`)

    expect(res.status).toBe(426)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toContain('WebSocket')
  })

  it('upgrades a real websocket and answers frames on it', async () => {
    const ws = new WebSocket(`ws://localhost:${server.port}/api/v1/audio/stream`)

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true })
      ws.addEventListener('error', () => reject(new Error('ws open failed')), { once: true })
    })

    // 未知帧类型 → 明确的 error 帧（说明帧分派真的跑在真实连接上）
    ws.send(JSON.stringify({ type: 'unknown' }))
    const reply = JSON.parse(await nextMessage(ws)) as { type: string; message: string }
    expect(reply.type).toBe('error')
    expect(reply.message).toContain('Unknown frame type')

    // start 帧需要 DB 路由；无 DB → error 帧，但连接保持可用（不崩溃、不静默）
    ws.send(JSON.stringify({ type: 'start', model: 'any', mode: 'asr' }))
    const startReply = JSON.parse(await nextMessage(ws)) as { type: string; message: string }
    expect(startReply.type).toBe('error')
    expect(startReply.message.length).toBeGreaterThan(0)

    ws.close()
  }, 15_000)

  it('reports a clear error for mode-invalid frames (commit in tts, text in asr)', async () => {
    const ws = new WebSocket(`ws://localhost:${server.port}/api/v1/audio/stream`)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true })
      ws.addEventListener('error', () => reject(new Error('ws open failed')), { once: true })
    })

    // 未 start 就 commit：mode 为空，必须明确拒绝而不是静默丢弃
    ws.send(JSON.stringify({ type: 'commit' }))
    const commitReply = JSON.parse(await nextMessage(ws)) as { type: string; message: string }
    expect(commitReply.type).toBe('error')
    expect(commitReply.message).toContain('asr')

    ws.send(JSON.stringify({ type: 'text', text: 'hi' }))
    const textReply = JSON.parse(await nextMessage(ws)) as { type: string; message: string }
    expect(textReply.type).toBe('error')
    expect(textReply.message).toContain('tts')

    ws.close()
  }, 15_000)

  it('parses control frames and rejects malformed JSON', () => {
    expect(parseFrame('{"type":"start"}')).toEqual({ type: 'start' })
    expect(parseFrame('not json')).toBeNull()
    expect(parseFrame('[]')).toBeNull()
  })

  it('creates an isolated session per connection', () => {
    const makeCtx = () =>
      ({
        get: () => ({
          id: crypto.randomUUID(),
          name: 'k',
          key: 'sk',
          workspaceId: '00000000-0000-0000-0000-000000000001',
          allowedModels: null,
        }),
        req: { path: '/api/v1/audio/stream', method: 'GET', header: () => undefined },
      }) as unknown as Parameters<typeof createAudioStreamHandlers>[0]

    const a = createAudioStreamHandlers(makeCtx())
    const b = createAudioStreamHandlers(makeCtx())
    // 两条连接的会话对象必须不同（状态不共享）
    expect(a).not.toBe(b)
  })
})
