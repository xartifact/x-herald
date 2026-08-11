import type { RouteAction } from '@xartifact/x-llm-gateway-shared'
import logger from '../../../lib/logger'
import { NoAvailableInstanceError } from '../router-selector'
import type { RouteResult } from '../router-selector'
import { routeActionHandlerRegistry } from './registry'
import type { RouteActionHandler, RouteActionResolutionContext } from './types'

/**
 * fallback 的主备链：两条腿各自软解析（异常/无 handler 都折叠成 []，不抛），
 * 都失败才整体抛 NoAvailableInstanceError。这是原来私有方法 resolveAction()
 * 的替代品——不再是第三份手写的 action-type 分支，而是复用同一个 registry
 * 递归解析 primary/backup，每条腿单独 try/catch。
 */
export class FallbackActionHandler implements RouteActionHandler {
  readonly type = 'fallback' as const

  async resolve(action: RouteAction, ctx: RouteActionResolutionContext): Promise<RouteResult[]> {
    const primaryAction = action.primary as RouteAction
    const backupAction = action.backup as RouteAction
    const [primaryCandidates, backupCandidates] = await Promise.all([
      this.resolveSoft(primaryAction, ctx),
      this.resolveSoft(backupAction, ctx),
    ])
    const tagged = [
      ...primaryCandidates.map((c) => ({ ...c, chainStep: 'primary' as const })),
      ...backupCandidates.map((c) => ({ ...c, chainStep: 'backup' as const })),
    ]

    if (tagged.length === 0) {
      logger.warn(
        { accessModel: ctx.am.name, rule: ctx.ruleMatch.name },
        'Fallback chain produced no candidates (both primary and backup empty)',
      )
      throw new NoAvailableInstanceError(
        ctx.am.name,
        `Fallback chain for route '${ctx.ruleMatch.name}' produced no candidates (both primary and backup resolved to empty)`,
        ctx.deps.buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, {
          outcome: 'all_failed',
          failedStep: { actionType: 'fallback' },
        }),
      )
    }

    logger.info(
      {
        accessModel: ctx.am.name,
        rule: ctx.ruleMatch.name,
        primaryCount: primaryCandidates.length,
        backupCount: backupCandidates.length,
      },
      'Fallback chain resolved',
    )
    return tagged
  }

  /** 单条腿的软解析：任何异常（含 reject 的抛出）→ []，绝不向上传播。 */
  private async resolveSoft(
    action: RouteAction,
    ctx: RouteActionResolutionContext,
  ): Promise<RouteResult[]> {
    const handler = routeActionHandlerRegistry.get(action.type)
    if (!handler) return []
    try {
      return await handler.resolve(action, ctx)
    } catch (err) {
      logger.debug(
        {
          err: err instanceof Error ? err.message : String(err),
          actionType: action.type,
          rule: ctx.ruleMatch.name,
        },
        'fallback leg soft-failed (returning empty)',
      )
      return []
    }
  }
}
