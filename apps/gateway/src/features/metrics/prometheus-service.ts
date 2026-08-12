/**
 * Prometheus metrics — Registry + helper for exposition format.
 *
 * Exposed at GET /metrics (no auth) so a Prometheus scrape job can collect:
 *  - default process / Node.js metrics
 *  - gateway HTTP QPS / duration / in-flight (from prometheus-http-middleware.ts)
 *  - circuit breaker state / trips (from circuit-breaker-state.ts hook)
 *
 * The service is opt-in: if prom-client isn't installed or init throws, all
 * metric.* calls become no-ops and the /metrics endpoint returns a stub.
 */

import promClient from 'prom-client'

const registry = new promClient.Registry()
registry.setDefaultLabels({ app: 'x-herald' })

// Default Node.js process metrics (CPU, memory, GC, event loop, etc.)
let defaultMetricsEnabled = false
try {
  promClient.collectDefaultMetrics({ register: registry })
  defaultMetricsEnabled = true
} catch {
  /* prom-client not available — feature becomes no-op */
}

const state = {
  registry,
  defaultMetricsEnabled,
}

export function getMetricsRegistry(): promClient.Registry {
  return state.registry
}

export function isDefaultMetricsEnabled(): boolean {
  return state.defaultMetricsEnabled
}

/** Render the registry in Prometheus text exposition format. */
export async function renderMetrics(): Promise<{ body: string; contentType: string }> {
  return {
    body: await state.registry.metrics(),
    contentType: state.registry.contentType,
  }
}
