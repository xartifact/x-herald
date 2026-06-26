import logger from '../../lib/logger';
import { getDatabase } from '../../db/client';
import { circuitBreakerEvents } from '@x-llm-gateway/db';
import { getConfig } from '../../features/gateway-config/service';

export const CB_CONFIG_KEY = 'CIRCUIT_BREAKER_CONFIG';

export interface CircuitBreakerSettings {
  failureThreshold: number;
  openDurationMs: number;
  maxBackoffMs?: number;
  maxTripsBeforeCooldown?: number;
  cooldownDurationMs?: number;
}

export interface CircuitBreakerMeta {
  instanceName: string;
  groupName: string;
  providerName: string;
}

export const DEFAULT_CONFIG: CircuitBreakerSettings = {
  failureThreshold: 3,
  openDurationMs: 60_000,
  maxBackoffMs: 300_000,
  maxTripsBeforeCooldown: 5,
  cooldownDurationMs: 1_800_000,
};

export let runtimeConfig: CircuitBreakerSettings = { ...DEFAULT_CONFIG };
let configLoadedAt = 0;
const CONFIG_CACHE_TTL = 30_000;

export async function refreshConfigIfStale(now: () => number = () => Date.now()): Promise<void> {
  const nowMs = now();
  if (nowMs - configLoadedAt < CONFIG_CACHE_TTL) return;
  configLoadedAt = nowMs;

  const stored = await getConfig<CircuitBreakerSettings | null>(CB_CONFIG_KEY, null);
  if (stored) runtimeConfig = stored;
}

export function configureCircuitBreaker(settings: CircuitBreakerSettings, now: () => number = () => Date.now()): void {
  runtimeConfig = settings;
  configLoadedAt = now();
  logger.info({ settings }, '[CircuitBreaker] Config updated');
}

export function getMaxBackoffMs(): number {
  return runtimeConfig.maxBackoffMs ?? DEFAULT_CONFIG.maxBackoffMs!;
}

export function getMaxTripsBeforeCooldown(): number {
  return runtimeConfig.maxTripsBeforeCooldown ?? DEFAULT_CONFIG.maxTripsBeforeCooldown!;
}

export function getCooldownDurationMs(): number {
  return runtimeConfig.cooldownDurationMs ?? DEFAULT_CONFIG.cooldownDurationMs!;
}

/**
 * Exponential backoff with jitter: min(base × 2^(tripCount-1), max) × (0.8..1.2)
 */
export function calculateBackoff(baseMs: number, tripCount: number, maxMs: number): number {
  if (tripCount <= 1) return baseMs;
  const exponential = baseMs * Math.pow(2, tripCount - 1);
  const capped = Math.min(exponential, maxMs);
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.round(capped * jitter);
}

export async function persistEvent(
  instanceId: string,
  event: 'opened' | 'half_open' | 'closed' | 'cooldown' | 'reset' | 'manual_trip',
  failureCount: number,
  openUntil: Date | null,
  meta: CircuitBreakerMeta,
  tripCount?: number,
): Promise<void> {
  const db = getDatabase();
  await db.insert(circuitBreakerEvents).values({
    instanceId,
    instanceName: meta.instanceName,
    groupName: meta.groupName,
    providerName: meta.providerName,
    event,
    failureCount,
    tripCount: tripCount ?? 0,
    openUntil: openUntil ?? undefined,
  });
}
