import type { RouteAction } from '@xartifact/x-llm-gateway-shared'
import { NoAvailableInstanceError } from '../router-selector'
import type { RouteResult } from '../router-selector'
import type { RouteActionHandler, RouteActionResolutionContext } from './types'

export class RouteToGroupActionHandler implements RouteActionHandler {
  readonly type = 'route_to_group' as const

  async resolve(action: RouteAction, ctx: RouteActionResolutionContext): Promise<RouteResult[]> {
    if (!action.targetId) {
      throw new NoAvailableInstanceError(
        ctx.am.name,
        `route_to_group action missing targetId (rule '${ctx.ruleMatch.name}')`,
        ctx.deps.buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, {
          outcome: 'all_failed',
        }),
      )
    }

    // resolveGroupCandidates 保证：正常返回时 candidates 非空
    // （routeCandidatesByGroupId 从不返回 []，空/禁用/无实例都是直接 throw，
    // 已经在 resolveGroupCandidates 里被捕获并补上 routeChain 再抛出）。
    const candidates = await ctx.deps.resolveGroupCandidates(
      action.targetId,
      ctx.routingContext,
      () =>
        ctx.deps.buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, {
          outcome: 'all_failed',
          failedStep: { actionType: 'route_to_group', resolvedGroupId: action.targetId },
        }),
    )
    return candidates.map((r) => ({
      ...r,
      mapping: ctx.mapping,
      matchedRule: {
        id: ctx.ruleMatch.id,
        name: ctx.ruleMatch.name,
        priority: ctx.ruleMatch.priority,
        conditions: ctx.ruleMatch.conditions,
      },
    }))
  }
}
