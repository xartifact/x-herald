import type { RouteAction, RouteActionType, RouteCondition } from '@xartifact/x-llm-gateway-shared'
import type { ModelMappingResult } from '../model-mapping'
import type { RouteMatcher } from '../route-rule-compiler'
import type { RouteResult, RoutingContext } from '../router-selector'
import type { RouteChainSnapshot, FailedStepInfo } from '../routing-trace-recorder'

/** CanvasRouteEngine 的 RouteMatcher 适配为 legacy {id,name,priority,action,conditions} 形状 */
export interface LegacyRuleMatch {
  id: string
  name: string
  priority: number
  action: RouteMatcher['action']
  conditions: RouteMatcher['conditions']
}

/** handler 需要但不该各自重新实现的协作方（原 AccessModelRouter 私有方法，搬到 support.ts） */
export interface RouteActionDeps {
  resolveGroupCandidates(
    groupId: string,
    context: RoutingContext,
    buildChain: () => RouteChainSnapshot,
  ): Promise<RouteResult[]>
  buildFailureSnapshot(
    context: RoutingContext,
    am: { id?: string; name: string } | undefined,
    ruleMatch:
      | { id: string; name: string; priority: number; conditions?: RouteCondition[] }
      | null
      | undefined,
    opts: { outcome: 'rejected' | 'all_failed'; failedStep?: FailedStepInfo },
  ): RouteChainSnapshot
  routeToInstance(
    instanceId: string,
    am: { id?: string; name: string; displayName?: string | null },
    context: RoutingContext,
    mapping: ModelMappingResult,
    ruleMatch?: { id: string; name: string; priority: number; conditions?: RouteCondition[] },
  ): Promise<RouteResult>
}

/** 一次 RouteAction 解析所需的全部上下文 */
export interface RouteActionResolutionContext {
  routingContext: RoutingContext
  am: { id?: string; name: string; displayName?: string | null }
  mapping: ModelMappingResult
  ruleMatch: LegacyRuleMatch
  deps: RouteActionDeps
}

/**
 * 约定：resolve() 要么返回非空的 RouteResult[]，要么 throw 一个带 `.routeChain`
 * 的错误（ModelNotFoundError / ModelDisabledError / NoAvailableInstanceError /
 * NoSuitableInstanceError / RequestRejectedError 之一）。绝不能静默返回 []——
 * 唯一允许"吞掉"某个 action 失败的地方是 FallbackActionHandler 内部对
 * primary/backup 两条腿分别做的 try/catch。
 */
export interface RouteActionHandler {
  readonly type: RouteActionType
  resolve(action: RouteAction, ctx: RouteActionResolutionContext): Promise<RouteResult[]>
}
