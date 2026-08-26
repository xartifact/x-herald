/**
 * Routing Trace Recorder — 路由链路追踪记录器
 *
 * 职责：
 *   1. 从 `RouteResult[]` 构建初始 chain 结构（哪些候选、按什么顺序、主备分类）
 *   2. 序列化进 `request_logs.metadata.routing.routeChain` JSONB
 *   3. 由 query API 反向 join `request_attempts` 还原每个候选的实际 outcome
 *
 * 设计要点：
 *   - 不传递 mutable state 到 executor（避免并发/异步复杂度）
 *   - 候选 outcome 由 `request_attempts` 表（已有 schema）承担
 *   - trace 只记录"计划链路"（planned chain），即实际执行前的快照
 *   - candidateIndex 是 0-based 全局序号（跨 primary/backup 单调递增），用于 join
 *
 * 使用方式：
 *   - `routeCandidates()` 内部：从返回的 RouteResult[] 构造 RouteChainSnapshot
 *   - 顶层 handler 把 snapshot 透传到 `logStartAsync({ routingTrace: { routeChain: ... } })`
 */

import type { IntentTraceInfo, RouteCondition } from '@xartifact/x-herald-shared'
import type { RouteResult } from './router-selector'

export interface PlannedCandidate {
  candidateIndex: number
  chainStepIndex: number
  chainStepKind: 'primary' | 'backup' | 'single'
  instanceId: string
  instanceName: string
  providerId: string
  providerName: string
  priority: number
  strategy: string
  groupName: string
  /** 该实例被选中/排序的决策依据（如 "smart selection (score: 63.5)"） */
  selectionReason?: string
  /** 该实例在能力/熔断/状态过滤中被排除的原因（如 "streaming not supported"） */
  rejectionReason?: string
}

export interface PlannedChainStep {
  index: number
  kind: 'primary' | 'backup' | 'single'
  actionType: string
  resolvedGroupId?: string
  resolvedGroupName?: string
  intentName?: string
  intentSource?: string
  intentTrace?: IntentTraceInfo
  capabilities?: string[]
  /** step 级决策依据（capability/intent 命中逻辑）；route_to_group/route_to_instance 不设 */
  decisionReason?: string
  candidates: PlannedCandidate[]
  /** 本 step 组内被能力/熔断/状态过滤掉的实例及原因（"为什么没选它"） */
  filteredOut?: Array<{ instanceName: string; reason: string }>
}

export interface RouteChainSnapshot {
  requestedModel: string
  accessModelId?: string
  accessModelName?: string
  matchedRule?: {
    id: string
    name: string
    priority: number
    /** 命中该规则前经过的条件链（条件节点） */
    conditions?: RouteCondition[]
  }
  chain: PlannedChainStep[]
  /**
   * 路由在产出任何候选之前就结束时的原因 —— 供 routing-traces 查询层区分
   * 「规则主动拒绝」vs「链路耗尽/无可用实例」，而不是盲猜 request_logs.status。
   * 不设置时表示正常路由（chain 非空，success 或 all_failed 由 attempts 决定）。
   */
  outcome?: 'rejected' | 'all_failed'
}

/** 0 候选但仍值得展示的一次路由决策（reject / intent 判了但目标组是空的 等） */
export interface FailedStepInfo {
  actionType: string
  resolvedGroupId?: string
  resolvedGroupName?: string
  intentName?: string
  intentSource?: string
  capabilities?: string[]
  /** step 级决策依据（reject 节点原因 / capability/intent 命中后但目标组空） */
  decisionReason?: string
  /**
   * 该 step 目标组内被能力/熔断/状态过滤掉的实例及原因（"为什么没选它"）。
   * 成功路径上由 RouteResult.rejections 携带（buildRouteChainSnapshot 填到 step.filteredOut），
   * 失败路径（route_to_group / fallback 腿等零候选）由 handler 显式透传，
   * 让 routing-traces 能展示"为什么这个组一个候选都没有"。
   */
  filteredOut?: Array<{ instanceName: string; reason: string }>
}

/**
 * 从 RouteResult[] 构造计划链路快照。
 *
 * @param routeResults 由 access-model-router.routeCandidates() 返回的候选列表；
 *   路由失败时（reject / 0 候选）传 `[]`，用 `options` 补充失败态信息
 * @param requestedModel 客户端原始请求的模型名
 * @param accessModel 解析后的接入模型（可选）
 * @param matchedRule 命中的路由规则（可选）
 * @param options 失败态专用：outcome 标记 + 0 候选时仍要展示的决策信息
 */
export function buildRouteChainSnapshot(
  routeResults: RouteResult[],
  requestedModel: string,
  accessModel?: { id: string; name: string },
  matchedRule?: { id: string; name: string; priority: number; conditions?: RouteCondition[] },
  options?: { outcome?: 'rejected' | 'all_failed'; failedStep?: FailedStepInfo },
): RouteChainSnapshot {
  // 按 chainStep 排序：primary 先，backup 后
  const order: Record<string, number> = { primary: 0, backup: 1, single: 2 }
  const sorted = [...routeResults].toSorted(
    (a, b) => (order[a.chainStep ?? 'single'] ?? 2) - (order[b.chainStep ?? 'single'] ?? 2),
  )

  let candidateCounter = 0
  const steps: PlannedChainStep[] = []
  const stepIndexMap = new Map<string, number>() // kind-actionType → stepIndex

  for (const r of sorted) {
    const kind = r.chainStep ?? 'single'
    const actionType = r.decision.strategy // strategy 字段复用，实际是 candidate's group routing strategy
    const stepKey = `${kind}-${actionType}`
    let stepIdx = stepIndexMap.get(stepKey)
    if (stepIdx === undefined) {
      stepIdx = steps.length
      stepIndexMap.set(stepKey, stepIdx)
      steps.push({
        index: stepIdx,
        kind,
        actionType,
        resolvedGroupId: r.group?.id,
        resolvedGroupName: r.group?.displayName || r.group?.name,
        intentName: r.intentName,
        intentSource: r.intentSource,
        intentTrace: r.intentTrace,
        capabilities: r.capabilities,
        // step 级决策依据（capability/intent 命中逻辑），由 handler 写到首个候选上
        decisionReason: r.decisionReason,
        candidates: [],
        // 该 step 首个候选携带同组被过滤实例（同一组的后续候选不复述）
        filteredOut: r.rejections,
      })
    }
    steps[stepIdx].candidates.push({
      candidateIndex: candidateCounter++,
      chainStepIndex: stepIdx,
      chainStepKind: kind,
      instanceId: r.instance.id,
      instanceName: r.instance.name,
      providerId: r.provider.id,
      providerName: r.provider.name,
      priority: r.instance.priority,
      strategy: r.decision.strategy,
      groupName: r.group?.displayName || r.group?.name || '',
      // 决策依据（如 "smart selection (score: 63.5)"），供 routing-trace 展示"为什么选它"
      selectionReason: r.decision.reason,
    })
  }

  // 0 候选但有失败态决策要展示（reject 直接没有候选；intent/capability 判了但目标组是空的）
  if (steps.length === 0 && options?.failedStep) {
    steps.push({
      index: 0,
      kind: 'single',
      ...options.failedStep,
      candidates: [],
    })
  }

  return {
    requestedModel,
    accessModelId: accessModel?.id,
    accessModelName: accessModel?.name,
    matchedRule: matchedRule
      ? {
          id: matchedRule.id,
          name: matchedRule.name,
          priority: matchedRule.priority,
          conditions: matchedRule.conditions,
        }
      : undefined,
    chain: steps,
    outcome: options?.outcome,
  }
}
