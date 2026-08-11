/**
 * Prometheus HTTP middleware — tracks request count, duration, in-flight per
 * method + route_template + status. route_template is derived from Hono's
 * matched route pattern (e.g. "/api/v1/chat/completions") to bound label cardinality.
 */

import type { MiddlewareHandler } from 'hono'
import promClient from 'prom-client'

import { getMetricsRegistry } from './prometheus-service'

const httpRequests = new promClient.Counter({
  name: 'gateway_http_requests_total',
  help: 'Total HTTP requests received by the gateway',
  labelNames: ['method', 'route_template', 'status'] as const,
  registers: [getMetricsRegistry()],
})

const httpDuration = new promClient.Histogram({
  name: 'gateway_http_request_duration_seconds',
  help: 'HTTP request handling latency in seconds',
  labelNames: ['method', 'route_template'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [getMetricsRegistry()],
})

const httpActive = new promClient.Gauge({
  name: 'gateway_http_active_requests',
  help: 'Currently in-flight HTTP requests',
  labelNames: ['method', 'route_template'] as const,
  registers: [getMetricsRegistry()],
})

/**
 * Derive a bounded route_template label from the matched Hono route.
 * Falls back to 'unmatched' for paths the router did not resolve (e.g. 404s),
 * which bounds cardinality to one extra label value.
 */
function routeTemplate(c: Parameters<MiddlewareHandler>[0]): string {
  const matched = c.req.routePath
  if (matched && matched !== '/') return matched
  // 404 / unknown path — use a constant label
  return 'unmatched'
}

export const prometheusHttpMiddleware: MiddlewareHandler = async (c, next) => {
  const method = c.req.method
  const route = routeTemplate(c)
  httpActive.inc({ method, route_template: route })
  const end = httpDuration.startTimer({ method, route_template: route })
  try {
    await next()
    const status = String(c.res.status)
    httpRequests.inc({ method, route_template: route, status })
  } catch (err) {
    httpRequests.inc({ method, route_template: route, status: '500' })
    throw err
  } finally {
    end()
    httpActive.dec({ method, route_template: route })
  }
}
