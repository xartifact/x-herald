import { EventEmitter } from 'node:events'

/**
 * 网关进程内日志广播总线。
 *
 * 通过 pino multistream 把进程内所有 logger 输出（含各 child logger）接到这里，
 * Web 端 /api/console-logs/live SSE 订阅实时查看——类似 tail -f 网关控制台。
 *
 * - 环形缓冲：保留最近 N 条（新连接追赶历史用），防止无订阅时日志丢失。
 * - 级别过滤：每个订阅者可以按最小级别订阅（默认 warn），bus 端过滤后再广播。
 */

export type ConsoleLogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

/** 级别优先级：数字越大越严重（与 pino 一致：fatal=60 ... trace=10） */
export const LEVEL_PRIORITY: Record<ConsoleLogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
}

/** 从 pino JSON 行解析出的日志记录（已结构化，供前端展示） */
export interface ConsoleLogEntry {
  /** 时间戳 ISO 字符串 */
  time: string
  /** 日志级别 */
  level: ConsoleLogLevel
  /** 消息文本 */
  msg: string
  /** child logger 模块名（如 'server' / 'route-rules-service'） */
  module?: string
  /** 附加结构化字段（排除 pino 内置 key 后的余项，扁平化展示） */
  fields: Record<string, unknown>
}

/** pino JSON 行里的内置 key，不当作业务字段展示 */
const BUILTIN_KEYS: Record<string, true> = {
  level: true,
  time: true,
  msg: true,
  pid: true,
  hostname: true,
  name: true,
  caller: true,
  v: true,
}

/** 新订阅连接时的追赶快照 */
export interface ConsoleLogSnapshot {
  entries: ConsoleLogEntry[]
}

const MAX_BUFFER = 500
const MAX_FIELD_STRING = 300

function truncate(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_FIELD_STRING
      ? `${value.slice(0, MAX_FIELD_STRING)}...(${value.length})`
      : value
  }
  if (depth >= 3) return String(value)
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => truncate(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = truncate(v, depth + 1)
    }
    return out
  }
  return value
}

/** 解析 pino 输出的一行 JSON，返回结构化 entry；解析失败返回 null */
export function parsePinoLine(line: string): ConsoleLogEntry | null {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>
    if (typeof raw.msg !== 'string' && raw.msg !== undefined) return null
    const levelRaw = raw.level
    const level: ConsoleLogLevel =
      typeof levelRaw === 'string' && levelRaw in LEVEL_PRIORITY
        ? (levelRaw as ConsoleLogLevel)
        : typeof levelRaw === 'number'
          ? ((Object.keys(LEVEL_PRIORITY).find(
              (k) => LEVEL_PRIORITY[k as ConsoleLogLevel] === levelRaw,
            ) as ConsoleLogLevel | undefined) ?? 'info')
          : 'info'

    const timeRaw = raw.time
    const time =
      typeof timeRaw === 'number'
        ? new Date(timeRaw).toISOString()
        : typeof timeRaw === 'string'
          ? new Date(timeRaw).toISOString()
          : new Date().toISOString()

    const fields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (BUILTIN_KEYS[k] || k === 'err' || k === 'error') continue
      fields[k] = truncate(v)
    }

    return {
      time,
      level,
      msg: typeof raw.msg === 'string' ? raw.msg : '',
      module: typeof raw.name === 'string' ? raw.name : undefined,
      fields,
    }
  } catch {
    return null
  }
}

export class ConsoleLogBus extends EventEmitter {
  private buffer: ConsoleLogEntry[] = []

  constructor(private readonly bufferSize = MAX_BUFFER) {
    super()
    this.setMaxListeners(100)
  }

  /** 由 pino stream 调用：写入一条原始 JSON 行 */
  write(line: string): void {
    const entry = parsePinoLine(line)
    if (!entry) return
    this.buffer.push(entry)
    if (this.buffer.length > this.bufferSize)
      this.buffer.splice(0, this.buffer.length - this.bufferSize)
    this.emit('log', entry)
  }

  /** 环形缓冲中的全部记录（新订阅追赶用） */
  snapshot(): ConsoleLogEntry[] {
    return [...this.buffer]
  }

  /** 订阅实时日志；返回退订函数 */
  subscribe(listener: (entry: ConsoleLogEntry) => void): () => void {
    this.on('log', listener)
    return () => this.off('log', listener)
  }

  clear(): void {
    this.buffer = []
  }
}

const g = globalThis as unknown as { __x_herald_consoleLogBus?: ConsoleLogBus }
if (!g.__x_herald_consoleLogBus) {
  g.__x_herald_consoleLogBus = new ConsoleLogBus()
}

export const consoleLogBus = g.__x_herald_consoleLogBus
export function resetConsoleLogBus(): void {
  consoleLogBus.clear()
  consoleLogBus.removeAllListeners()
}
