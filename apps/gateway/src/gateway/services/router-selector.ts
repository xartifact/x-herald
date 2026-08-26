import logger from '../../lib/logger'
import {
  fetchGroupInstancesPerf,
  type InstancePerfData,
} from '../../features/metrics/services/instance-perf-cache'
import type { ModelGroup, ModelInstance } from '@xartifact/x-herald-db'
import { providers } from '@xartifact/x-herald-db'
import type {
  RouteCondition,
  StandardRequest,
  IntentTraceInfo,
  RoutingStrategy,
} from '@xartifact/x-herald-shared'

import { circuitBreakerRegistry } from './circuit-breaker'
import type { ModelMappingResult } from './model-mapping'
import type { RouteChainSnapshot } from './routing-trace-recorder'

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
    /** 命中该规则时经过的条件链（供 routing-trace 展示"为什么走这条规则"） */
    conditions?: RouteCondition[]
  }
  perf?: InstancePerfData
  /**
   * 「主备链」路由时标记来自哪一步：
   *   - 'primary'：主出口
   *   - 'backup'： 备出口
   *   - undefined：非链式路由（单出口 route_to_group / intent / capability 等）
   */
  chainStep?: 'primary' | 'backup'
  /** 意图路由特有：分类结果与来源（供 routing-trace 展示决策细节） */
  intentName?: string
  intentSource?: string
  /** 意图路由决策依据：用户消息 + 分类器响应/置信度（供 routing-trace 展示"为什么命中"） */
  intentTrace?: IntentTraceInfo
  /** 能力路由特有：命中的能力列表（供 routing-trace 展示决策细节） */
  capabilities?: string[]
  /** step 级决策依据（capability/intent 命中逻辑）；route_to_group/route_to_instance 不设 */
  decisionReason?: string
  /** 同组候选过滤时被排除的实例及其原因（供 routing-trace 展示"为什么没选它"） */
  rejections?: InstanceRejection[]
}
export interface RoutingContext {
  requestedModel: string
  streaming: boolean
  hasTools: boolean
  hasVision: boolean
  virtualKeyId: string
  /** 一次客户端请求的分组 ID（intent_logs 关联用；由顶层 handler 生成传入） */
  requestGroupId?: string
  preferredProvider?: string
  request?: StandardRequest
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

/**
 * 生成单个候选实例的组内选择依据（供 routing-trace 展示"为什么选它"）。
 * 按策略给出排序真正用到的量化指标：priority 数值 / 权重 / TTFB / 成本 / smart 评分。
 *
 * strategy 收紧为 RoutingStrategy（单一真实源，shared/src/types/model-group.ts）。
 * 任何新增策略都会被 TS 静态检查拦截（satisfies never 兜底）——避免策略枚举与文案
 * 不同步后静默回退到 default 分支。
 */
export function buildSelectionReason(
  strategy: RoutingStrategy | 'direct',
  c: Candidate,
  idx: number,
  perf: InstancePerfData | undefined,
): string {
  const head = idx === 0 ? 'primary selection' : `failover candidate #${idx + 1}`
  const prio = c.instance.priority ?? 0
  const created = c.instance.createdAt
    ? `, created ${c.instance.createdAt.toISOString().slice(0, 10)}`
    : ''
  switch (strategy) {
    case 'round_robin':
      return `${head}: round-robin rotation (priority ${prio}${created})`
    case 'weighted':
      return `${head}: weighted random (weight ${c.instance.weight ?? 1})`
    case 'least_response_time':
      return perf?.ttfbAvg != null
        ? `${head}: TTFB avg ${Math.round(perf.ttfbAvg)}ms`
        : `${head}: no perf data, priority ${prio}${created}`
    case 'cost_optimized': {
      const cost = c.instance.costPer1kTokens
      return cost != null
        ? `${head}: cost $${(cost.input + cost.output).toFixed(4)}/1k`
        : `${head}: no cost data, priority ${prio}${created}`
    }
    case 'smart':
      return `${head}: smart score ${computeSmartScore(perf, c.instance).toFixed(2)} (successRate*50 + TTFB*30 + retry*15 + cost*5)`
    case 'priority':
      return `${head}: priority ${prio}${created}`
    case 'direct':
      // route_to_instance action 走的是直连实例，无组内排序；idx 恒为 0
      return `direct routing: instance '${c.instance.name}' pinned by route_to_instance`
    default: {
      // 编译期检查：枚举加新成员但漏处理时编译失败
      const _exhaustive: never = strategy
      return `${head}: unknown strategy (${_exhaustive})`
    }
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
  /**
   * 路由追踪快照。构造时可选传入；也可能是 model-group-router.ts 内部先抛出
   * 后，被 access-model-router.ts 捕获时事后补上（这类错误不知道调用方的
   * matchedRule/conditions 上下文），所以不能是 readonly。
   */
  routeChain?: RouteChainSnapshot
  constructor(modelName: string, detail?: string, routeChain?: RouteChainSnapshot) {
    super(detail ?? `Model '${modelName}' not found`)
    this.name = 'ModelNotFoundError'
    this.routeChain = routeChain
  }
}

export class ModelDisabledError extends Error {
  routeChain?: RouteChainSnapshot
  constructor(modelName: string, detail?: string, routeChain?: RouteChainSnapshot) {
    super(detail ?? `Model '${modelName}' is disabled`)
    this.name = 'ModelDisabledError'
    this.routeChain = routeChain
  }
}

export class NoAvailableInstanceError extends Error {
  routeChain?: RouteChainSnapshot
  constructor(modelName: string, detail?: string, routeChain?: RouteChainSnapshot) {
    super(detail ?? `No available instances for model '${modelName}'`)
    this.name = 'NoAvailableInstanceError'
    this.routeChain = routeChain
  }
}

export class NoSuitableInstanceError extends Error {
  routeChain?: RouteChainSnapshot
  /**
   * 组内被能力/熔断/状态过滤掉的实例及原因。全组被过滤时（filtered.length === 0）
   * 由 model-group-router 填入，供失败路由快照把"为什么一个候选都没有"透传到 routing-traces。
   */
  rejections?: InstanceRejection[]
  constructor(
    modelName: string,
    detail?: string,
    routeChain?: RouteChainSnapshot,
    rejections?: InstanceRejection[],
  ) {
    super(detail ?? `No suitable instance found for model '${modelName}' with given constraints`)
    this.name = 'NoSuitableInstanceError'
    this.routeChain = routeChain
    this.rejections = rejections
  }
}

export class RequestRejectedError extends Error {
  routeChain?: RouteChainSnapshot
  constructor(reason: string, routeChain?: RouteChainSnapshot) {
    super(reason)
    this.name = 'RequestRejectedError'
    this.routeChain = routeChain
  }
}

/**
 * Provider returned a 2xx response that is not valid for the requested
 * protocol. Downstream should report 502 Bad Gateway and may failover.
 */
export class ProviderInvalidResponseError extends Error {
  readonly providerName: string
  readonly statusCode: number
  constructor(providerName: string, statusCode: number, detail?: string) {
    super(detail ?? `Provider '${providerName}' returned an invalid response (HTTP ${statusCode})`)
    this.name = 'ProviderInvalidResponseError'
    this.providerName = providerName
    this.statusCode = statusCode
  }
}
