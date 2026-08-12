import { describe, it, expect } from 'bun:test'
import { CapabilityActionHandler } from './capability-handler'
import type { RouteAction } from '@xartifact/x-herald-shared'
import type { RouteActionResolutionContext } from './types'

const handler = new CapabilityActionHandler()

function capabilityAction(map: Record<string, string>): RouteAction {
  return {
    type: 'capability',
    capabilityConfig: { capabilityMap: map, defaultGroupId: 'group-general' },
  } as unknown as RouteAction
}

function createContext(requestMessages: unknown[]) {
  const routingContext = {
    requestedModel: 'gpt-4',
    streaming: false,
    hasTools: false,
    hasVision: true,
    virtualKeyId: 'vk1',
    request: { model: 'gpt-4', messages: requestMessages },
  } as RouteActionResolutionContext['routingContext']

  const resolveGroupCandidates = async (groupId: string) => {
    ;(resolveGroupCandidates as unknown as { lastGroupId?: string }).lastGroupId = groupId
    return []
  }

  const ctx = {
    routingContext,
    am: { id: 'am1', name: 'am', displayName: null },
    mapping: {} as never,
    ruleMatch: { id: 'rule1', name: 'rule', priority: 1, conditions: [] },
    deps: {
      resolveGroupCandidates,
      buildFailureSnapshot: () => ({}) as never,
      routeToInstance: async () => ({}) as never,
    },
  } as unknown as RouteActionResolutionContext

  return { ctx, resolveGroupCandidates }
}

describe('CapabilityActionHandler stateless slice', () => {
  it('slices a vision request to system + current turn before routing downstream', async () => {
    const messages = [
      { role: 'system', content: 'assistant persona' },
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'https://x.com/img.png' } }],
      },
    ] as unknown[]
    const { ctx, resolveGroupCandidates } = createContext(messages)

    await handler.resolve(capabilityAction({ vision: 'group-vision' }), ctx)

    expect(resolveGroupCandidates.lastGroupId).toBe('group-vision')
    // 历史 user/assistant 轮被丢弃，只留 system + 当前回合
    expect(ctx.routingContext.request!.messages).toEqual([
      { role: 'system', content: 'assistant persona' },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'https://x.com/img.png' } }],
      },
    ])
  })

  it('keeps full history for a stateful (text) request', async () => {
    const messages = [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'follow-up' },
    ] as unknown[]
    const { ctx } = createContext(messages)

    await handler.resolve(capabilityAction({ text: 'group-text' }), ctx)

    expect(ctx.routingContext.request!.messages).toBe(messages)
    expect(ctx.routingContext.request!.messages).toHaveLength(3)
  })

  it('keeps full history for a stateful (tool_use) request', async () => {
    const messages = [
      { role: 'user', content: 'check weather in beijing' },
      { role: 'assistant', content: 'calling get_weather', tool_calls: [] },
      { role: 'user', content: 'and also in shanghai' },
    ] as unknown[]
    const { ctx } = createContext(messages)

    await handler.resolve(capabilityAction({ tool_use: 'group-tools' }), ctx)

    expect(ctx.routingContext.request!.messages).toBe(messages)
  })
})
