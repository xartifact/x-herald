import EventEmitter from 'node:events'
import {
  STREAM_EVENT_BUS_STALE_TIMEOUT_MS,
  STREAM_WAITING_TIMEOUT_MS,
} from '@xartifact/x-herald-shared'

import logger from '../../lib/logger'

export type LiveStreamEvent =
  | {
      event: 'waiting'
      logId: string
      modelName: string
      originalModelName?: string
      providerName: string
      virtualKeyName?: string
      startTime: number
      incomingProtocol: string
    }
  | {
      event: 'started'
      logId: string
      modelName: string
      originalModelName?: string
      providerName: string
      virtualKeyName?: string
      startTime: number
      incomingProtocol: string
    }
  | {
      event: 'chunk'
      logId: string
      outputTokens: number
      totalChunks: number
      hasThinking: boolean
      elapsedMs: number
    }
  | {
      event: 'completed'
      logId: string
      status: 'success' | 'failure'
      inputTokens: number
      outputTokens: number
      responseTimeMs: number
      thinkingDurationMs?: number
    }
  | {
      event: 'aborted'
      logId: string
      reason?: 'client_disconnect' | 'timeout' | 'cancelled' | 'stale_cleanup'
    }

// 当前活跃流快照（新连接时追赶状态用）
type ActiveStreamSnapshot =
  | (LiveStreamEvent & { event: 'waiting' })
  | (LiveStreamEvent & { event: 'started' })
  | (LiveStreamEvent & { event: 'chunk' })

class LogEventBus extends EventEmitter {
  readonly activeStreams = new Map<string, ActiveStreamSnapshot>()
  private readonly lastActivityAt = new Map<string, number>()

  /** AbortController 注册表，用于手动取消 + TTFB 超时中断 */
  private readonly abortControllers = new Map<string, AbortController>()

  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  startCleanup(intervalMs = 60_000): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    this.cleanupTimer = setInterval(() => this.cleanupStale(), intervalMs)
    logger.info({ intervalMs }, '[LogEventBus] Stale cleanup started')
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private cleanupStale(): void {
    const now = Date.now()
    let removed = 0
    const entries = Array.from(this.activeStreams.entries())
    for (const [logId, snapshot] of entries) {
      const lastActivity = this.lastActivityAt.get(logId) ?? now
      const elapsed = now - (snapshot.event === 'waiting' ? snapshot.startTime : lastActivity)
      const threshold =
        snapshot.event === 'waiting' ? STREAM_WAITING_TIMEOUT_MS : STREAM_EVENT_BUS_STALE_TIMEOUT_MS

      if (elapsed > threshold) {
        logger.warn(
          {
            logId,
            event: snapshot.event,
            elapsedMs: elapsed,
            threshold,
          },
          '[LogEventBus] Removing stale active stream',
        )
        this.activeStreams.delete(logId)
        this.lastActivityAt.delete(logId)
        const ctrl = this.abortControllers.get(logId)
        if (ctrl && !ctrl.signal.aborted) {
          ctrl.abort()
        }
        this.abortControllers.delete(logId)
        super.emit('log', { event: 'aborted', logId, reason: 'stale_cleanup' })
        removed++
      }
    }
    if (removed > 0) {
      logger.info({ removed }, '[LogEventBus] Cleanup completed')
    }
  }

  /** 注册 AbortController，用于后续取消 */
  registerAbortController(logId: string, controller: AbortController): void {
    this.abortControllers.set(logId, controller)
  }

  /** 取消指定请求（手动操作或外部请求） */
  abortRequest(logId: string): boolean {
    const ctrl = this.abortControllers.get(logId)
    if (ctrl && !ctrl.signal.aborted) {
      ctrl.abort()
    }
    this.abortControllers.delete(logId)
    const existed = this.activeStreams.has(logId)
    this.activeStreams.delete(logId)
    this.lastActivityAt.delete(logId)
    if (existed) {
      super.emit('log', { event: 'aborted', logId, reason: 'cancelled' })
    }
    return existed
  }

  emitLog(payload: LiveStreamEvent): void {
    if (payload.event === 'waiting' || payload.event === 'started' || payload.event === 'chunk') {
      this.activeStreams.set(payload.logId, payload)
      this.lastActivityAt.set(payload.logId, Date.now())
    } else {
      this.activeStreams.delete(payload.logId)
      this.lastActivityAt.delete(payload.logId)
      // 清理 AbortController（completed/aborted 后不再需要）
      if (payload.event === 'aborted' || payload.event === 'completed') {
        this.abortControllers.delete(payload.logId)
      }
    }
    super.emit('log', payload)
  }

  reset(): void {
    this.activeStreams.clear()
    this.lastActivityAt.clear()
    this.abortControllers.clear()
    this.removeAllListeners()
  }
}

const g = globalThis as unknown as { __xllm_logEventBus?: LogEventBus }
if (!g.__xllm_logEventBus) {
  g.__xllm_logEventBus = new LogEventBus()
  g.__xllm_logEventBus.setMaxListeners(100)
  g.__xllm_logEventBus.startCleanup()
}

export const logEventBus = g.__xllm_logEventBus
