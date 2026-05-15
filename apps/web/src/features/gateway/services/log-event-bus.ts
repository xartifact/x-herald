import EventEmitter from 'node:events';

import logger from '@/core/lib/logger';

export type LiveStreamEvent =
  | {
      event: 'waiting';
      logId: string;
      modelName: string;
      originalModelName?: string;
      providerName: string;
      virtualKeyName?: string;
      startTime: number;
      incomingProtocol: string;
    }
  | {
      event: 'started';
      logId: string;
      modelName: string;
      originalModelName?: string;
      providerName: string;
      virtualKeyName?: string;
      startTime: number;
      incomingProtocol: string;
    }
  | {
      event: 'chunk';
      logId: string;
      outputTokens: number;
      totalChunks: number;
      hasThinking: boolean;
      elapsedMs: number;
    }
  | {
      event: 'completed';
      logId: string;
      status: 'success' | 'failure';
      inputTokens: number;
      outputTokens: number;
      responseTimeMs: number;
      thinkingDurationMs?: number;
    }
  | { event: 'aborted'; logId: string; reason?: 'client_disconnect' | 'timeout' | 'cancelled' | 'stale_cleanup' };

// 当前活跃流快照（新连接时追赶状态用）
type ActiveStreamSnapshot =
  | (LiveStreamEvent & { event: 'waiting' })
  | (LiveStreamEvent & { event: 'started' })
  | (LiveStreamEvent & { event: 'chunk' });

// 清理阈值（防御性措施：处理服务重启/异常残留）
// waiting 超过此时间说明 TTFB 链路的超时机制未正常工作（服务重启等情况）
const STALE_WAITING_MS = 10 * 60 * 1000;  // 10 分钟（思考模型可能需要数分钟）
const STALE_STARTED_MS = 30 * 60 * 1000;  // 30 分钟（流式可能跑很久，但仍有限）

class LogEventBus extends EventEmitter {
  readonly activeStreams = new Map<string, ActiveStreamSnapshot>();

  /** AbortController 注册表，用于手动取消 + TTFB 超时中断 */
  private readonly abortControllers = new Map<string, AbortController>();

  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  startCleanup(intervalMs = 60_000): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = setInterval(() => this.cleanupStale(), intervalMs);
    logger.info({ intervalMs }, '[LogEventBus] Stale cleanup started');
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private cleanupStale(): void {
    const now = Date.now();
    let removed = 0;
    const entries = Array.from(this.activeStreams.entries());
    for (const [logId, snapshot] of entries) {
      const startTimeField = snapshot.event === 'waiting' || snapshot.event === 'started' ? snapshot.startTime : 0;
      const elapsed = now - startTimeField;
      let isStale = false;

      if (snapshot.event === 'waiting' && elapsed > STALE_WAITING_MS) {
        isStale = true;
      } else if (snapshot.event === 'started' && elapsed > STALE_STARTED_MS) {
        isStale = true;
      }

      if (isStale) {
        logger.warn(
          { logId, event: snapshot.event, elapsedMs: elapsed, threshold: snapshot.event === 'waiting' ? STALE_WAITING_MS : STALE_STARTED_MS },
          '[LogEventBus] Removing stale active stream',
        );
        this.activeStreams.delete(logId);
        const ctrl = this.abortControllers.get(logId);
        if (ctrl && !ctrl.signal.aborted) {
          ctrl.abort();
        }
        this.abortControllers.delete(logId);
        super.emit('log', { event: 'aborted', logId, reason: 'stale_cleanup' });
        removed++;
      }
    }
    if (removed > 0) {
      logger.info({ removed }, '[LogEventBus] Cleanup completed');
    }
  }

  /** 注册 AbortController，用于后续取消 */
  registerAbortController(logId: string, controller: AbortController): void {
    this.abortControllers.set(logId, controller);
  }

  /** 取消指定请求（手动操作或外部请求） */
  abortRequest(logId: string): boolean {
    const ctrl = this.abortControllers.get(logId);
    if (ctrl && !ctrl.signal.aborted) {
      ctrl.abort();
    }
    this.abortControllers.delete(logId);
    const existed = this.activeStreams.has(logId);
    this.activeStreams.delete(logId);
    if (existed) {
      super.emit('log', { event: 'aborted', logId, reason: 'cancelled' });
    }
    return existed;
  }

  emitLog(payload: LiveStreamEvent): void {
    if (payload.event === 'waiting' || payload.event === 'started' || payload.event === 'chunk') {
      this.activeStreams.set(payload.logId, payload);
    } else {
      this.activeStreams.delete(payload.logId);
      // 清理 AbortController（completed/aborted 后不再需要）
      if (payload.event === 'aborted' || payload.event === 'completed') {
        this.abortControllers.delete(payload.logId);
      }
    }
    super.emit('log', payload);
  }
}

const g = globalThis as unknown as { __xllm_logEventBus?: LogEventBus };
if (!g.__xllm_logEventBus) {
  g.__xllm_logEventBus = new LogEventBus();
  g.__xllm_logEventBus.setMaxListeners(100);
  g.__xllm_logEventBus.startCleanup();
}

export const logEventBus = g.__xllm_logEventBus;
