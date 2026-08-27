import { useCallback, useEffect, useRef, useState } from 'react'

// 与后端 apps/gateway/src/lib/console-log-bus.ts 的类型对齐
export type ConsoleLogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export interface ConsoleLogEntry {
  time: string
  level: ConsoleLogLevel
  msg: string
  module?: string
  fields: Record<string, unknown>
}

export const CONSOLE_LOG_LEVELS: ConsoleLogLevel[] = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
]

export const CONSOLE_LOG_LEVEL_LABELS: Record<ConsoleLogLevel, string> = {
  fatal: 'FATAL',
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG',
  trace: 'TRACE',
}

/** 级别颜色（tail 风格） */
export const CONSOLE_LOG_LEVEL_COLORS: Record<ConsoleLogLevel, string> = {
  fatal: 'text-red-500 font-bold',
  error: 'text-red-400',
  warn: 'text-yellow-500',
  info: 'text-sky-400',
  debug: 'text-muted-foreground',
  trace: 'text-muted-foreground/60',
}

const MAX_ENTRIES = 1000

export interface UseConsoleLogsOptions {
  /** 是否启用连接（页面挂载即 true） */
  enabled?: boolean
  /** 最小日志级别，切换后重新连接（服务端过滤） */
  minLevel?: ConsoleLogLevel
}

/**
 * 订阅网关进程日志（/api/console-logs/live SSE）。
 * - 连接时服务端回放环形缓冲，随后持续推送
 * - 断连 3s 自动重连
 * - 客户端按级别二次过滤（保留切换即时生效，无需重连）
 */
export function useConsoleLogs(options: UseConsoleLogsOptions = {}) {
  const { enabled = true, minLevel = 'warn' } = options
  const [entries, setEntries] = useState<ConsoleLogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [paused, setPaused] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const append = useCallback((entry: ConsoleLogEntry) => {
    if (pausedRef.current) return
    const normalized = { ...entry, fields: entry.fields ?? {} }
    setEntries((prev) => {
      const next = [...prev, normalized]
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
    })
  }, [])

  const connect = useCallback(() => {
    if (!enabled) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const token = localStorage.getItem('admin_token')
    const query = minLevel && minLevel !== 'warn' ? `?level=${minLevel}` : ''
    fetch(`/api/console-logs/live${query}`, {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.body) return
        setConnected(true)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        const pump = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (done) return
            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split('\n\n')
            buffer = parts.pop() ?? ''
            for (const part of parts) {
              const line = part.trim()
              if (!line.startsWith('data:')) continue
              const data = line.slice(5).trim()
              if (!data) continue
              try {
                append(JSON.parse(data) as ConsoleLogEntry)
              } catch {
                // 解析失败跳过
              }
            }
            return pump()
          })

        return pump()
      })
      .catch(() => {
        setConnected(false)
        // 断连后 3s 重连
        if (!controller.signal.aborted) {
          setTimeout(connect, 3000)
        }
      })
      .finally(() => setConnected(false))
  }, [enabled, minLevel, append])

  useEffect(() => {
    connect()
    return () => {
      abortRef.current?.abort()
    }
  }, [connect])

  const clear = useCallback(() => setEntries([]), [])

  return { entries, connected, paused, setPaused, clear }
}
