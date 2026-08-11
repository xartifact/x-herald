/**
 * Gateway business metrics — request lifecycle, TTFB, tokens, failovers, intent.
 *
 * Labels use bounded cardinality sources (provider name, actual model name,
 * instance name, group name, reason string). Avoid putting UUIDs / full URLs /
 * raw user input here — Prometheus label cardinality should stay bounded.
 */

import promClient from 'prom-client'

import { getMetricsRegistry } from './prometheus-service'

// ─── Routing latency ─────────────────────────────────────────────────────────
// Time spent inside AccessModelRouter.routeCandidates before a candidate
// is chosen. Per access_model — the public-facing surface.
const routingDuration = new promClient.Histogram({
  name: 'gateway_routing_duration_seconds',
  help: 'Time spent selecting a route candidate, per access model',
  labelNames: ['access_model', 'result'] as const, // result=matched|no_match|rejected
  buckets: [0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [getMetricsRegistry()],
})

// ─── Proxy executor metrics ──────────────────────────────────────────────────
// request_duration: wall-clock per provider+model selection (any outcome)
// first_byte_seconds: TTFB-like latency (first SSE chunk or first JSON byte)
const requestDuration = new promClient.Histogram({
  name: 'gateway_request_duration_seconds',
  help: 'End-to-end wall-clock duration per upstream provider+model request',
  labelNames: ['provider', 'model', 'stream', 'status'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60],
  registers: [getMetricsRegistry()],
})

const firstByteDuration = new promClient.Histogram({
  name: 'gateway_request_first_byte_seconds',
  help: 'Time to first byte / first SSE chunk from the upstream provider',
  labelNames: ['provider', 'model', 'stream'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [getMetricsRegistry()],
})

const requestTokens = new promClient.Counter({
  name: 'gateway_request_tokens_total',
  help: 'Token usage aggregated by provider+model+direction (input|output)',
  labelNames: ['provider', 'model', 'direction'] as const,
  registers: [getMetricsRegistry()],
})

// ─── Failover path ───────────────────────────────────────────────────────────
const failovers = new promClient.Counter({
  name: 'gateway_model_instance_failovers_total',
  help: 'Total model-instance failovers, labeled by provider+instance+reason',
  labelNames: ['provider', 'instance', 'reason'] as const,
  registers: [getMetricsRegistry()],
})

// ─── Intent classifier ──────────────────────────────────────────────────────
const intentClassifierDuration = new promClient.Histogram({
  name: 'gateway_intent_classifier_duration_seconds',
  help: 'Wall-clock duration of intent classifier LLM call per provider',
  labelNames: ['provider'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30],
  registers: [getMetricsRegistry()],
})

const intentClassifierFallback = new promClient.Counter({
  name: 'gateway_intent_classifier_fallback_total',
  help: 'Number of times the intent router fell back to the default group',
  labelNames: ['provider', 'reason'] as const,
  registers: [getMetricsRegistry()],
})

export const gatewayBusinessMetrics = {
  routingDuration,
  requestDuration,
  firstByteDuration,
  requestTokens,
  failovers,
  intentClassifierDuration,
  intentClassifierFallback,
}
