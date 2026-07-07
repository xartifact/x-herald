import { mock } from 'bun:test'
import { transformerRegistry } from '../gateway/transformer/registry'
import { circuitBreakerRegistry } from '../gateway/services/circuit-breaker-state'
import { rateLimitEngine } from '../gateway/services/rate-limit-engine'
import { logEventBus } from '../gateway/services/log-event-bus'
import { invalidateVirtualKeyCache } from '../middleware/virtual-key'

export function resetAllState(): void {
  transformerRegistry.clear()
  circuitBreakerRegistry.reset()
  rateLimitEngine.reset()
  logEventBus.reset()
  mock.restore()
}

export function resetTransformerRegistry(): void {
  transformerRegistry.clear()
}
export function resetCircuitBreaker(): void {
  circuitBreakerRegistry.reset()
}
export function resetRateLimit(): void {
  rateLimitEngine.reset()
}
export function resetLogEventBus(): void {
  logEventBus.reset()
}
export { invalidateVirtualKeyCache }
