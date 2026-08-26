import type { RouteAction } from '@xartifact/x-herald-shared'
import logger from '../../../lib/logger'
import { NoAvailableInstanceError, NoSuitableInstanceError } from '../router-selector'
import type { RouteResult } from '../router-selector'
import type { FailedStepInfo } from '../routing-trace-recorder'
import { routeActionHandlerRegistry } from './registry'
import type { RouteActionHandler, RouteActionResolutionContext } from './types'
import type { LegFailure } from './support'

/**
 * fallback 的主备链：两条腿各自软解析（异常/无 handler 都折叠成 []，不抛），
 * 都失败才整体抛 NoAvailableInstanceError。这是原来私有方法 resolveAction()
 * 的替代品——不再是第三份手写的 action-type 分支，而是复用同一个 registry
 * 递归解析 primary/backup，每条腿单独 try/catch。
 *
 * 失败可诊断性：resolveSoft() 保留每条腿的失败原因（LegFailure），
 * 整体抛错时把"每条腿为什么空"写进 routeChain 的 failedStep，让 routing-traces
 * 能展示"主备都失败的具体原因"（如 vision not supported / circuit breaker open），
 * 而不是只有一个 `fallback, candidates: []` 的空壳。
 */
export class FallbackActionHandler implements RouteActionHandler {
  readonly type = 'fallback' as const

  async resolve(action: RouteAction, ctx: RouteActionResolutionContext): Promise<RouteResult[]> {
    const primaryAction = action.primary as RouteAction
    const backupAction = action.backup as RouteAction
    const [primaryLeg, backupLeg] = await Promise.all([
      this.resolveSoft(primaryAction, ctx),
      this.resolveSoft(backupAction, ctx),
    ])
    const tagged = [
      ...primaryLeg.candidates.map((c) => ({ ...c, chainStep: 'primary' as const })),
      ...backupLeg.candidates.map((c) => ({ ...c, chainStep: 'backup' as const })),
    ]

    if (tagged.length === 0) {
      logger.warn(
        {
          accessModel: ctx.am.name,
          rule: ctx.ruleMatch.name,
          primaryError: primaryLeg.failure?.errorMessage,
          backupError: backupLeg.failure?.errorMessage,
        },
        'Fallback chain produced no candidates (both primary and backup empty)',
      )
      const failedStep: FailedStepInfo = { actionType: 'fallback' }
      const legFailures = [primaryLeg.failure, backupLeg.failure].filter(
        (f): f is LegFailure => f != null,
      )
      if (legFailures.length > 0) {
        failedStep.decisionReason = `主链失败: ${primaryLeg.failure?.errorMessage ?? '无候选'}；备链失败: ${
          backupLeg.failure?.errorMessage ?? '无候选'
        }`
        // 把每条腿组内被过滤的实例及原因合并进快照，供 UI 展示"为什么这个组一个候选都没有"
        failedStep.filteredOut = legFailures.flatMap((f) => f.filteredOut ?? [])
      }
      throw new NoAvailableInstanceError(
        ctx.am.name,
        `Fallback chain for route '${ctx.ruleMatch.name}' produced no candidates (both primary and backup resolved to empty)`,
        ctx.deps.buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, {
          outcome: 'all_failed',
          failedStep,
        }),
      )
    }

    logger.info(
      {
        accessModel: ctx.am.name,
        rule: ctx.ruleMatch.name,
        primaryCount: primaryLeg.candidates.length,
        backupCount: backupLeg.candidates.length,
      },
      'Fallback chain resolved',
    )
    return tagged
  }

  /** 单条腿的软解析：任何异常（含 reject 的抛出）→ []，绝不向上传播，但保留失败原因。 */
  private async resolveSoft(
    action: RouteAction,
    ctx: RouteActionResolutionContext,
  ): Promise<{ candidates: RouteResult[]; failure?: LegFailure }> {
    const handler = routeActionHandlerRegistry.get(action.type)
    if (!handler) {
      return {
        candidates: [],
        failure: {
          actionType: action.type,
          errorMessage: `unhandled action type '${action.type}'`,
        },
      }
    }
    try {
      return { candidates: await handler.resolve(action, ctx) }
    } catch (err) {
      logger.debug(
        {
          err: err instanceof Error ? err.message : String(err),
          actionType: action.type,
          rule: ctx.ruleMatch.name,
        },
        'fallback leg soft-failed (returning empty)',
      )
      return {
        candidates: [],
        failure: {
          actionType: action.type,
          errorMessage: err instanceof Error ? err.message : String(err),
          ...(err instanceof NoSuitableInstanceError && err.rejections
            ? { filteredOut: err.rejections }
            : {}),
        },
      }
    }
  }
}
