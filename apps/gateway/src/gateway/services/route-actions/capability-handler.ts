import type { RouteAction } from '@xartifact/x-herald-shared'
import { resolveCapabilityRoute, sliceToStatelessMessages } from '../capability-router'
import { NoAvailableInstanceError } from '../router-selector'
import type { RouteResult } from '../router-selector'
import type { RouteActionHandler, RouteActionResolutionContext } from './types'

export class CapabilityActionHandler implements RouteActionHandler {
  readonly type = 'capability' as const

  async resolve(action: RouteAction, ctx: RouteActionResolutionContext): Promise<RouteResult[]> {
    if (!action.capabilityConfig || !ctx.routingContext.request) {
      throw new NoAvailableInstanceError(
        ctx.am.name,
        `capability action missing capabilityConfig or request body (rule '${ctx.ruleMatch.name}')`,
        ctx.deps.buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, {
          outcome: 'all_failed',
        }),
      )
    }

    const capResult = await resolveCapabilityRoute(
      ctx.routingContext.request,
      { requestId: ctx.routingContext.virtualKeyId },
      action.capabilityConfig,
    )
    // 无状态能力（vision/audio/video）：只转发「system + 当前回合」，丢弃对话历史。
    // 单点就地裁切 routingContext.request —— executor 与 egress 都读同一个
    // StandardRequest 引用，因此 openai/anthropic/gemini 三套协议一致生效，
    // 无需改动任何 executor。原始请求仍由 rawBody/standardRequestBody 单独记录。
    if (capResult.contextMode === 'stateless' && ctx.routingContext.request) {
      ctx.routingContext.request.messages = sliceToStatelessMessages(ctx.routingContext.request)
    }
    const stepDecisionReason = `capability matched: ${capResult.capabilities.join(', ')}`
    const candidates = await ctx.deps.resolveGroupCandidates(
      capResult.groupId,
      ctx.routingContext,
      () =>
        ctx.deps.buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, {
          outcome: 'all_failed',
          failedStep: {
            actionType: 'capability',
            resolvedGroupId: capResult.groupId,
            capabilities: capResult.capabilities,
            decisionReason: stepDecisionReason,
          },
        }),
    )

    // step 级决策依据（"为什么命中此 capability"）—— 同 step 候选共享
    return candidates.map((r) => ({
      ...r,
      mapping: ctx.mapping,
      matchedRule: {
        id: ctx.ruleMatch.id,
        name: ctx.ruleMatch.name,
        priority: ctx.ruleMatch.priority,
        conditions: ctx.ruleMatch.conditions,
      },
      capabilities: capResult.capabilities,
      decisionReason: stepDecisionReason,
    }))
  }
}
