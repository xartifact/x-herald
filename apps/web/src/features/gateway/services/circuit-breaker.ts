import logger from '@/core/lib/logger';

export const CB_CONFIG_KEY = 'CIRCUIT_BREAKER_CONFIG';

export interface CircuitBreakerSettings {
  failureThreshold: number;
  openDurationMs: number;
}

export interface CircuitBreakerMeta {
  instanceName: string;
  groupName: string;
  providerName: string;
}

const DEFAULT_CONFIG: CircuitBreakerSettings = {
  failureThreshold: 3,
  openDurationMs: 60_000,
};

let runtimeConfig: CircuitBreakerSettings = { ...DEFAULT_CONFIG };
let configLoadedAt = 0;
const CONFIG_CACHE_TTL = 30_000;

function refreshConfigIfStale(): void {
  const now = Date.now();
  if (now - configLoadedAt < CONFIG_CACHE_TTL) return;
  configLoadedAt = now;

  import('@/features/gateway-config/service')
    .then(({ getConfig }) => getConfig<CircuitBreakerSettings | null>(CB_CONFIG_KEY, null))
    .then((stored) => { if (stored) runtimeConfig = stored; })
    .catch(() => {});
}

export function configureCircuitBreaker(settings: CircuitBreakerSettings): void {
  runtimeConfig = settings;
  configLoadedAt = Date.now();
  logger.info({ settings }, '[CircuitBreaker] Config updated');
}

function persistEvent(
  instanceId: string,
  event: 'opened' | 'half_open' | 'closed',
  failureCount: number,
  openUntil: Date | null,
  meta: CircuitBreakerMeta,
): void {
  import('@/core/db/client')
    .then(({ getDatabase }) => {
      const db = getDatabase();
      return import('@/features/circuit-breaker/db').then(({ circuitBreakerEvents }) =>
        db.insert(circuitBreakerEvents).values({
          instanceId,
          instanceName: meta.instanceName,
          groupName: meta.groupName,
          providerName: meta.providerName,
          event,
          failureCount,
          openUntil: openUntil ?? undefined,
        })
      );
    })
    .catch((err) => logger.warn({ err, instanceId, event }, '[CircuitBreaker] Failed to persist event'));
}

interface InstanceState {
  failures: number;
  openUntil: number;
  state: 'closed' | 'open' | 'half_open';
  meta: CircuitBreakerMeta;
}

const EMPTY_META: CircuitBreakerMeta = { instanceName: '', groupName: '', providerName: '' };

class CircuitBreakerRegistry {
  private readonly states = new Map<string, InstanceState>();

  isOpen(instanceId: string): boolean {
    refreshConfigIfStale();

    const s = this.states.get(instanceId);
    if (!s || s.state === 'closed') return false;

    if (s.state === 'open' && Date.now() >= s.openUntil) {
      s.state = 'half_open';
      persistEvent(instanceId, 'half_open', s.failures, null, s.meta);
      return false;
    }

    return s.state === 'open';
  }

  recordSuccess(instanceId: string, meta?: CircuitBreakerMeta): void {
    const s = this.states.get(instanceId);
    if (s) {
      logger.debug({ instanceId }, '[CircuitBreaker] Circuit reset on success');
      persistEvent(instanceId, 'closed', s.failures, null, meta ?? s.meta);
      this.states.delete(instanceId);
    }
  }

  recordFailure(instanceId: string, meta?: CircuitBreakerMeta): void {
    refreshConfigIfStale();

    let s = this.states.get(instanceId);
    if (!s) {
      s = { failures: 0, openUntil: 0, state: 'closed', meta: meta ?? EMPTY_META };
      this.states.set(instanceId, s);
    }
    if (meta) s.meta = meta;
    s.failures++;

    if (s.state === 'half_open' || s.failures >= runtimeConfig.failureThreshold) {
      s.state = 'open';
      s.openUntil = Date.now() + runtimeConfig.openDurationMs;
      const openUntilDate = new Date(s.openUntil);
      logger.warn(
        { instanceId, failures: s.failures, openDurationMs: runtimeConfig.openDurationMs },
        '[CircuitBreaker] Circuit opened',
      );
      persistEvent(instanceId, 'opened', s.failures, openUntilDate, s.meta);
    }
  }

  getState(instanceId: string): 'closed' | 'open' | 'half_open' {
    return this.states.get(instanceId)?.state ?? 'closed';
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();
