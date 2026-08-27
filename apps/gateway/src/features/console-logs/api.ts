import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

import rootLogger from '../../lib/logger'
import { consoleLogBus, LEVEL_PRIORITY, type ConsoleLogLevel } from '../../lib/console-log-bus'

const logger = rootLogger.child({ module: 'console-logs' })

const consoleLogRoutes = new Hono()

const LEVELS: ConsoleLogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

function parseLevel(raw: string | undefined): ConsoleLogLevel {
  if (raw && LEVELS.includes(raw as ConsoleLogLevel)) return raw as ConsoleLogLevel
  return 'warn'
}

/**
 * GET /api/console-logs/live?level=warn — 网关进程日志实时流（SSE）。
 *
 * - 连接时先回放环形缓冲中满足级别过滤的最近日志（追赶重启前的输出）
 * - 之后持续推送新日志，15s 心跳保活
 * - 客户端断开自动退订
 */
consoleLogRoutes.get('/live', (c) => {
  const minLevel = parseLevel(c.req.query('level'))
  const minPriority = LEVEL_PRIORITY[minLevel]

  return streamSSE(c, async (s) => {
    for (const entry of consoleLogBus.snapshot()) {
      if (LEVEL_PRIORITY[entry.level] >= minPriority) {
        await s.writeSSE({ data: JSON.stringify(entry) })
      }
    }

    const unsubscribe = consoleLogBus.subscribe(async (entry) => {
      if (LEVEL_PRIORITY[entry.level] < minPriority) return
      try {
        await s.writeSSE({ data: JSON.stringify(entry) })
      } catch {
        /* client disconnected */
      }
    })

    await new Promise<void>((resolve) => {
      const heartbeat = setInterval(async () => {
        try {
          await s.writeSSE({ data: '', event: 'ping' })
        } catch {
          clearInterval(heartbeat)
          resolve()
        }
      }, 15000)

      if (c.req.raw.signal.aborted) {
        clearInterval(heartbeat)
        resolve()
        return
      }
      c.req.raw.signal.addEventListener(
        'abort',
        () => {
          clearInterval(heartbeat)
          resolve()
        },
        { once: true },
      )
    })

    unsubscribe()
  })
})

/** 供测试重置 */
export function _resetConsoleLogRoutesForTests(): void {
  logger.debug('console-logs routes reset')
}

export default consoleLogRoutes
