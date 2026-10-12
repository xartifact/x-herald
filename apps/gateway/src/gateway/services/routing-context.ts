import type { ModelGroup, ModelInstance } from '@xartifact/x-herald-db'
import type { providers } from '@xartifact/x-herald-db'

import type { ModelMappingResult } from './model-mapping'
import type { RoutingContext } from './error-handler'

interface CandidateInfo {
  instance: ModelInstance
  provider: typeof providers.$inferSelect
  group: ModelGroup
  mapping: ModelMappingResult
  decision: { strategy: string }
}

/**
 * 从 failover 候选构造 handleGatewayError 的路由上下文，
 * 让 fallback 失败日志与正常请求对齐展示 provider/实际模型（列表「实际」列与详情路由区）。
 */
export function routingContextFromCandidate(candidate: CandidateInfo): RoutingContext {
  return {
    providerId: candidate.provider.id,
    providerName: candidate.provider.name,
    modelName: candidate.mapping.modelName,
    originalModelName: candidate.mapping.originalModel,
    actualModelName: candidate.instance.actualModelName,
    instanceId: candidate.instance.id,
    modelGroupId: candidate.group.id,
    modelGroupName: candidate.group.name,
    strategy: candidate.decision.strategy,
  }
}
