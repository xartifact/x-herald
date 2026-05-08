import EventEmitter from 'node:events';

export type LiveStreamEvent =
  | {
      event: 'waiting'; // 请求已发出，等待 provider TTFB
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
      latencyMs: number;
      thinkingDurationMs?: number;
    }
  | { event: 'aborted'; logId: string };

// 当前活跃流快照（新连接时追赶状态用）
type ActiveStreamSnapshot =
  | (LiveStreamEvent & { event: 'waiting' })
  | (LiveStreamEvent & { event: 'started' })
  | (LiveStreamEvent & { event: 'chunk' });

class LogEventBus extends EventEmitter {
  readonly activeStreams = new Map<string, ActiveStreamSnapshot>();

  emitLog(payload: LiveStreamEvent): void {
    if (payload.event === 'waiting' || payload.event === 'started' || payload.event === 'chunk') {
      this.activeStreams.set(payload.logId, payload);
    } else {
      this.activeStreams.delete(payload.logId);
    }
    super.emit('log', payload);
  }
}

const g = globalThis as unknown as { __xllm_logEventBus?: LogEventBus };
if (!g.__xllm_logEventBus) {
  g.__xllm_logEventBus = new LogEventBus();
  g.__xllm_logEventBus.setMaxListeners(100); // 支持多个 SSE 连接
}

export const logEventBus = g.__xllm_logEventBus;
