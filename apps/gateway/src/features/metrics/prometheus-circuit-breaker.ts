/**
 * Prometheus metrics for the circuit breaker.
 *
 * Subscribes to CircuitBreakerRegistry's state-change events and exposes:
 *  - gateway_circuit_breaker_state{instance}  gauge (0=closed, 1=half_open, 2=open, 3=cooldown)
 *  - gateway_circuit_breaker_trips_total{instance, source}  counter (source=auto|manual)
 *
 * State transitions are sourced from CircuitBreakerRegistry.subscribe() — see
 * services/circuit-breaker-state.ts for the publisher side.
 */

import promClient from 'prom-client'

import { circuitBreakerRegistry } from '../../gateway/services/circuit-breaker-state'
import { getMetricsRegistry } from './prometheus-service'

const STATE_VALUE = {
  closed: 0,
  half_open: 1,
  open: 2,
  cooldown: 3,
} as const

const cbState = new promClient.Gauge({
  name: 'gateway_circuit_breaker_state',
  help: 'Circuit breaker state per instance (0=closed, 1=half_open, 2=open, 3=cooldown)',
  labelNames: ['instance'] as const,
  registers: [getMetricsRegistry()],
})

const cbTrips = new promClient.Counter({
  name: 'gateway_circuit_breaker_trips_total',
  help: 'Total circuit breaker trips per instance, labeled by source (auto|manual)',
  labelNames: ['instance', 'source'] as const,
  registers: [getMetricsRegistry()],
})

let installed = false

/**
 * Wire up the prometheus subscriber. Idempotent — safe to call multiple times.
 * Should be invoked once during engine bootstrap (see createEngine.ts).
 */
export function installCircuitBreakerPrometheus(): void {
  if (installed) return
  installed = true
  // Seed current values for any instances already tracked (e.g. after
  // recoverCircuitBreakerState restored entries from DB on boot).
  void (async () => {
    try {
      const states = await circuitBreakerRegistry.getAllStates()
      for (const s of states) {
        cbState.set({ instance: s.instanceId }, STATE_VALUE[s.state])
      }
    } catch {
      /* getAllStates throws if config is stale — safe to ignore at boot */
    }
  })()

  circuitBreakerRegistry.subscribe((instanceId, state) => {
    cbState.set({ instance: instanceId }, STATE_VALUE[state])
    // A 'trip' is any transition into 'open'. We can't distinguish auto vs manual
    // from the event alone; downstream alerting queries rate() on the counter.
    if (state === 'open') {
      cbTrips.inc({ instance: instanceId, source: 'auto' })
    }
  })
}

export const circuitBreakerPrometheusMetrics = { cbState, cbTrips }
