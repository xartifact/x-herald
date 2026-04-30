import logger from '@/core/lib/logger';

export const CB_CONFIG_KEY = 'CIRCUIT_BREAKER_CONFIG';

export interface CircuitBreakerSettings {
  failureThreshold: number;
  openDurationMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerSettings = {
  failureThreshold: 3,
  openDurationMs: 60_000,
};

// 运行时配置（通过 configure() 从 db 更新，默认值兜底）
let runtimeConfig: CircuitBreakerSettings = { ...DEFAULT_CONFIG };
let configLoadedAt = 0;
const CONFIG_CACHE_TTL = 30_000;

/**
 * 异步从 gateway-config 刷新熔断器配置（fire-and-forget，不阻塞同步接口）
 */
function refreshConfigIfStale(): void {
  const now = Date.now();
  if (now - configLoadedAt < CONFIG_CACHE_TTL) return;
  configLoadedAt = now;

  import('@/features/gateway-config/service')
    .then(({ getConfig }) => getConfig<CircuitBreakerSettings | null>(CB_CONFIG_KEY, null))
    .then((stored) => {
      if (stored) runtimeConfig = stored;
    })
    .catch(() => {});
}

/**
 * 立即更新运行时配置（由 settings API 在保存后调用）
 */
export function configureCircuitBreaker(settings: CircuitBreakerSettings): void {
  runtimeConfig = settings;
  configLoadedAt = Date.now();
  logger.info({ settings }, '[CircuitBreaker] Config updated');
}

interface InstanceState {
  failures: number;
  openUntil: number;
  state: 'closed' | 'open' | 'half_open';
}

class CircuitBreakerRegistry {
  private readonly states = new Map<string, InstanceState>();

  isOpen(instanceId: string): boolean {
    refreshConfigIfStale();

    const s = this.states.get(instanceId);
    if (!s || s.state === 'closed') return false;

    if (s.state === 'open' && Date.now() >= s.openUntil) {
      s.state = 'half_open';
      return false;
    }

    return s.state === 'open';
  }

  recordSuccess(instanceId: string): void {
    if (this.states.has(instanceId)) {
      logger.debug({ instanceId }, '[CircuitBreaker] Circuit reset on success');
      this.states.delete(instanceId);
    }
  }

  recordFailure(instanceId: string): void {
    refreshConfigIfStale();

    let s = this.states.get(instanceId);
    if (!s) {
      s = { failures: 0, openUntil: 0, state: 'closed' };
      this.states.set(instanceId, s);
    }
    s.failures++;

    if (s.state === 'half_open' || s.failures >= runtimeConfig.failureThreshold) {
      s.state = 'open';
      s.openUntil = Date.now() + runtimeConfig.openDurationMs;
      logger.warn(
        { instanceId, failures: s.failures, openDurationMs: runtimeConfig.openDurationMs },
        '[CircuitBreaker] Circuit opened',
      );
    }
  }

  getState(instanceId: string): 'closed' | 'open' | 'half_open' {
    return this.states.get(instanceId)?.state ?? 'closed';
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();
