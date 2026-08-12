import type { RouteAction } from '@xartifact/x-herald-shared'
import { RequestRejectedError } from '../model-group-router'
import type { RouteResult } from '../router-selector'
import type { RouteActionHandler, RouteActionResolutionContext } from './types'

export class RejectActionHandler implements RouteActionHandler {
  readonly type = 'reject' as const

  async resolve(action: RouteAction, ctx: RouteActionResolutionContext): Promise<RouteResult[]> {
    throw new RequestRejectedError(
      action.reason || `Request rejected by route rule '${ctx.ruleMatch.name}'`,
      ctx.deps.buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, {
        outcome: 'rejected',
        failedStep: { actionType: 'reject' },
      }),
    )
  }
}
