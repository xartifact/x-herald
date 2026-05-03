import logger from '@/core/lib/logger';

export interface AbortManagerResult {
  isTimeout: boolean;
  disconnectReason: 'timeout' | 'client_disconnect' | null;
}

/**
 * AbortManager 管理客户端断开检测和 TTFB 超时
 *
 * 封装每个请求尝试的 AbortController 生命周期:
 * 1. 注册客户端断开监听
 * 2. 每次尝试创建新的 AbortController（避免已取消信号污染重试）
 * 3. 设置 TTFB 超时
 * 4. 清理资源
 */
export class AbortManager {
  private clientSignal: AbortSignal | undefined;
  private cleanupAttemptFn: (() => void) | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  public isClientDisconnected = false;

  constructor(clientSignal: AbortSignal | undefined) {
    this.clientSignal = clientSignal;
  }

  /**
   * 注册客户端断开监听（只需调用一次）
   */
  registerClientDisconnect(): void {
    this.clientSignal?.addEventListener('abort', () => {
      this.isClientDisconnected = true;
    });
  }

  /**
   * 为当前尝试创建 AbortController（含 TTFB 超时）
   * 返回 cleanup 函数，调用后清除超时 + 移除 propagateDisconnect 监听
   *
   * @param ttfbTimeoutMs TTFB 超时毫秒（流式 600000，非流式 300000）
   * @param requestId 请求 ID（用于日志）
   * @param isStreaming 是否流式（用于日志）
   * @returns { controller, cleanup }
   */
  createAttempt(ttfbTimeoutMs: number, requestId: string, isStreaming: boolean): {
    controller: AbortController;
    cleanup: () => void;
  } {
    const controller = new AbortController();

    // 客户端断开 → 中止当前尝试
    const propagateDisconnect = () => controller.abort();
    this.clientSignal?.addEventListener('abort', propagateDisconnect);

    // TTFB 超时 → 中止当前尝试
    this.timeoutId = setTimeout(() => {
      logger.warn({ requestId, timeout: ttfbTimeoutMs, streaming: isStreaming }, 'Request TTFB timeout, aborting');
      controller.abort();
    }, ttfbTimeoutMs);

    const cleanup = () => {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }
      this.timeoutId = null;
      this.clientSignal?.removeEventListener('abort', propagateDisconnect);
    };
    this.cleanupAttemptFn = cleanup;

    return { controller, cleanup };
  }

  /**
   * 最终清理：移除客户端断开监听
   * 在重试循环结束后调用（finally 块）
   */
  dispose(): void {
    this.cleanupAttemptFn?.();
    // Note: clientSignal abort listener for isClientDisconnected is not removed
    // because it doesn't affect anything after the request completes
  }
}
