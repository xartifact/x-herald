import type { RouteAction } from '@xartifact/x-herald-shared'
import { NoAvailableInstanceError } from '../router-selector'
import type { RouteResult } from '../router-selector'
import type { RouteActionHandler, RouteActionResolutionContext } from './types'

export class RouteToInstanceActionHandler implements RouteActionHandler {
  readonly type = 'route_to_instance' as const

  async resolve(action: RouteAction, ctx: RouteActionResolutionContext): Promise<RouteResult[]> {
    if (!action.targetId) {
      throw new NoAvailableInstanceError(
        ctx.am.name,
        `route_to_instance action missing targetId (rule '${ctx.ruleMatch.name}')`,
        ctx.deps.buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, {
          outcome: 'all_failed',
        }),
      )
    }
    const result = await ctx.deps.routeToInstance(
      action.targetId,
      ctx.am,
      ctx.routingContext,
      ctx.mapping,
      ctx.ruleMatch,
    )
    return [result]
  }
}
