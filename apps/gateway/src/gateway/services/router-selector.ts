import logger from '../../lib/logger'
import {
  fetchGroupInstancesPerf,
  type InstancePerfData,
} from '../../features/metrics/services/instance-perf-cache'
import type { ModelGroup, ModelInstance } from '@xartifact/x-llm-gateway-db'
import { providers } from '@xartifact/x-llm-gateway-db'

import { circuitBreakerRegistry } from './circuit-breaker'
import type { ModelMappingResult } from './model-mapping'

export interface RouteResult {
  instance: ModelInstance
  provider: typeof providers.$inferSelect
  group: ModelGroup
  decision: {
    strategy: string
    reason: string
    candidates: number
    responseTime?: number
  }
  mapping: ModelMappingResult
  matchedRule?: {
    id: string
    name: string
    priority: number
  }
  perf?: InstancePerfData
}

export interface RoutingContext {
  requestedModel: string
  streaming: boolean
  hasTools: boolean
  hasVision: boolean
  virtualKeyId: string
  preferredProvider?: string
  maxResponseTime?: number
  maxCost?: number
}

export type Candidate = {
  instance: ModelInstance
  provider: typeof providers.$inferSelect
  group: ModelGroup
}

export const FAILOVER_STATUS_CODES = new Set([429, 500, 502, 503, 504, 521, 522, 524])

const roundRobinCounters = new Map<string, number>()

function byPriorityThenAge(a: Candidate, b: Candidate): number {
  const pd = a.instance.priority - b.instance.priority
  if (pd !== 0) return pd
  return a.instance.createdAt.getTime() - b.instance.createdAt.getTime()
}

function computeSmartScore(perf: InstancePerfData | undefined, instance: ModelInstance): number {
  const successRate = perf?.successRate ?? 0.85
  const ttfbAvg = perf?.ttfbAvg
  const avgRetryCount = perf?.avgRetryCount ?? 0
  const cost = instance.costPer1kTokens

  const successScore = successRate * 50
  const ttfbScore = ttfbAvg != null ? Math.min(1, 1500 / ttfbAvg) * 30 : 15
  const retryScore = Math.max(0, 1 - avgRetryCount / 5) * 15
  const costScore =
    cost != null ? Math.min(1, 1 / ((cost.input + cost.output) / 2 + 0.001)) * 5 : 2.5

  return successScore + ttfbScore + retryScore + costScore
}

export async function selectByStrategy(
  candidates: Candidate[],
  strategy: string,
  groupId: string,
): Promise<Candidate[]> {
  switch (strategy) {
    case 'round_robin': {
      const sorted = [...candidates].toSorted(byPriorityThenAge)
      const count = roundRobinCounters.get(groupId) ?? 0
      roundRobinCounters.set(groupId, count + 1)
      const idx = count % sorted.length
      return [...sorted.slice(idx), ...sorted.slice(0, idx)]
    }

    case 'weighted': {
      const totalWeight = candidates.reduce((sum, c) => sum + (c.instance.weight ?? 1), 0)
      let rand = Math.random() * totalWeight
      let selectedIdx = candidates.length - 1
      for (let i = 0; i < candidates.length; i++) {
        rand -= candidates[i].instance.weight ?? 1
        if (rand <= 0) {
          selectedIdx = i
          break
        }
      }
      const rest = [
        ...candidates.slice(0, selectedIdx),
        ...candidates.slice(selectedIdx + 1),
      ].toSorted(byPriorityThenAge)
      return [candidates[selectedIdx], ...rest]
    }

    case 'least_response_time': {
      const perfMap = await fetchGroupInstancesPerf(groupId)
      const withPerf: Array<{ c: Candidate; ttfb: number }> = []
      const withoutPerf: Candidate[] = []
      for (const c of candidates) {
        const ttfb = perfMap.get(c.instance.id)?.ttfbAvg
        if (ttfb != null) withPerf.push({ c, ttfb })
        else withoutPerf.push(c)
      }
      withPerf.sort((a, b) => (a.ttfb !== b.ttfb ? a.ttfb - b.ttfb : byPriorityThenAge(a.c, b.c)))
      withoutPerf.sort(byPriorityThenAge)
      return [...withPerf.map((x) => x.c), ...withoutPerf]
    }

    case 'cost_optimized': {
      const withCost: Array<{ c: Candidate; totalCost: number }> = []
      const withoutCost: Candidate[] = []
      for (const c of candidates) {
        const cost = c.instance.costPer1kTokens
        if (cost != null) withCost.push({ c, totalCost: cost.input + cost.output })
        else withoutCost.push(c)
      }
      withCost.sort((a, b) =>
        a.totalCost !== b.totalCost ? a.totalCost - b.totalCost : byPriorityThenAge(a.c, b.c),
      )
      withoutCost.sort(byPriorityThenAge)
      return [...withCost.map((x) => x.c), ...withoutCost]
    }

    case 'smart': {
      const perfMap = await fetchGroupInstancesPerf(groupId)
      return [...candidates]
        .map((c) => ({ c, score: computeSmartScore(perfMap.get(c.instance.id), c.instance) }))
        .toSorted((a, b) => (a.score !== b.score ? b.score - a.score : byPriorityThenAge(a.c, b.c)))
        .map((x) => x.c)
    }

    case 'priority':
    default:
      return [...candidates].toSorted(byPriorityThenAge)
  }
}

export interface InstanceRejection {
  instanceName: string
  reason: string
}

export interface FilterResult {
  candidates: Candidate[]
  rejections: InstanceRejection[]
}

export async function filterCandidates(
  instances: Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect }>,
  context: RoutingContext,
  group: ModelGroup,
): Promise<FilterResult> {
  const rejections: InstanceRejection[] = []
  const checks = await Promise.all(
    instances.map(async ({ instance, provider }) => {
      if (await circuitBreakerRegistry.isOpen(instance.id)) {
        logger.debug({ instanceId: instance.id }, '[CircuitBreaker] Skipping open circuit instance')
        rejections.push({ instanceName: instance.name, reason: 'circuit breaker open' })
        return false
      }
      if (instance.status === 'down') {
        rejections.push({ instanceName: instance.name, reason: 'instance status is down' })
        return false
      }
      const capabilities = { ...group.capabilities, ...instance.config?.capabilityOverrides }
      if (context.streaming && !capabilities.streaming) {
        rejections.push({ instanceName: instance.name, reason: 'streaming not supported' })
        return false
      }
      if (context.hasTools && !capabilities.functionCalling) {
        rejections.push({ instanceName: instance.name, reason: 'function calling not supported' })
        return false
      }
      if (context.hasVision && !capabilities.vision) {
        rejections.push({ instanceName: instance.name, reason: 'vision not supported' })
        return false
      }
      const protocol = provider.protocols?.openai || provider.protocols?.anthropic
      if (!protocol?.enabled) {
        rejections.push({ instanceName: instance.name, reason: 'provider protocol not enabled' })
        return false
      }
      return true
    }),
  )
  const candidates = instances
    .filter((_, i) => checks[i])
    .map(({ instance, provider }) => ({ instance, provider, group }))
  return { candidates, rejections }
}

export class ModelNotFoundError extends Error {
  constructor(modelName: string, detail?: string) {
    super(detail ?? `Model '${modelName}' not found`)
    this.name = 'ModelNotFoundError'
  }
}

export class ModelDisabledError extends Error {
  constructor(modelName: string, detail?: string) {
    super(detail ?? `Model '${modelName}' is disabled`)
    this.name = 'ModelDisabledError'
  }
}

export class NoAvailableInstanceError extends Error {
  constructor(modelName: string, detail?: string) {
    super(detail ?? `No available instances for model '${modelName}'`)
    this.name = 'NoAvailableInstanceError'
  }
}

export class NoSuitableInstanceError extends Error {
  constructor(modelName: string, detail?: string) {
    super(detail ?? `No suitable instance found for model '${modelName}' with given constraints`)
    this.name = 'NoSuitableInstanceError'
  }
}

export class RequestRejectedError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'RequestRejectedError'
  }
}
