import { describe, it, expect, beforeEach } from 'bun:test'

import { Hono } from 'hono'
import consoleLogRoutes from './api'
import { consoleLogBus, resetConsoleLogBus } from '../../lib/console-log-bus'

function makeApp() {
  const app = new Hono()
  app.route('/api/console-logs', consoleLogRoutes)
  return app
}

/**
 * 读取 SSE response 直到收到目标文本。
 * streamSSE 是长连接（不主动结束），读到目标后立即取消 reader 以免测试挂起。
 */
async function readUntil(
  res: Response,
  predicate: (chunk: string) => boolean,
  timeoutMs = 2000,
): Promise<string> {
  if (!res.body) throw new Error('no body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let acc = ''
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { done, value } = await reader.read()
    if (done) break
    acc += decoder.decode(value, { stream: true })
    if (predicate(acc)) {
      await reader.cancel().catch(() => {})
      return acc
    }
  }
  await reader.cancel().catch(() => {})
  return acc
}

describe('console-logs SSE API', () => {
  beforeEach(() => {
    resetConsoleLogBus()
  })

  it('replays buffered entries on connect', async () => {
    consoleLogBus.write(JSON.stringify({ level: 50, time: 1000, msg: 'old error' }))
    consoleLogBus.write(JSON.stringify({ level: 40, time: 2000, msg: 'old warn' }))

    const app = makeApp()
    const res = await app.request('/api/console-logs/live')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const text = await readUntil(res, (t) => t.includes('old error') && t.includes('old warn'))
    expect(text).toContain('old error')
    expect(text).toContain('old warn')
  })

  it('filters replay by level query param (default warn+)', async () => {
    consoleLogBus.write(JSON.stringify({ level: 30, time: 1, msg: 'info-line' }))
    consoleLogBus.write(JSON.stringify({ level: 40, time: 2, msg: 'warn-line' }))

    const app = makeApp()
    const res = await app.request('/api/console-logs/live')
    const text = await readUntil(res, (t) => t.includes('warn-line'))
    expect(text).toContain('warn-line')
    expect(text).not.toContain('info-line')
  })

  it('includes info level when level=info requested', async () => {
    consoleLogBus.write(JSON.stringify({ level: 30, time: 1, msg: 'info-line' }))

    const app = makeApp()
    const res = await app.request('/api/console-logs/live?level=info')
    const text = await readUntil(res, (t) => t.includes('info-line'))
    expect(text).toContain('info-line')
  })

  it('streams new entries to the client after connect', async () => {
    const app = makeApp()
    const res = await app.request('/api/console-logs/live')
    if (!res.body) throw new Error('no body')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    // 连接后写入新日志，验证实时推送（初始回放为空 → 第一个 chunk 就是这条新日志）
    consoleLogBus.write(JSON.stringify({ level: 40, time: Date.now(), msg: 'live-arrived' }))
    const second = await reader.read()
    const text = decoder.decode(second.value ?? new Uint8Array())
    expect(text).toContain('live-arrived')
    await reader.cancel().catch(() => {})
  })
})
