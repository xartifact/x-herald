import { describe, expect, it } from 'bun:test'

import { buildRouteChainSnapshot } from './routing-trace-recorder'
import type { RouteResult } from './router-selector'

describe('buildRouteChainSnapshot', () => {
  const baseCandidate = {
    instance: { id: 'i-1', name: 'inst-1', priority: 10 },
    provider: { id: 'p-1', name: 'prov-1' },
    group: { id: 'g-1', name: 'group-1', displayName: 'Group One' },
    decision: { strategy: 'priority', reason: 'test', candidates: 1 },
    mapping: {
      modelName: 'm',
      isMapped: true,
      originalModel: 'm',
      mappingType: 'virtual' as const,
    },
    matchedRule: undefined,
  }

  it('groups single candidates under one chain step (kind=single)', () => {
    const candidates = [
      {
        ...baseCandidate,
        instance: { id: 'i-1', name: 'inst-1', priority: 10 },
        provider: { id: 'p-1', name: 'prov-1' },
        group: { id: 'g-1', name: 'group-1', displayName: 'Group One' },
      },
    ] as unknown as RouteResult[]
    const trace = buildRouteChainSnapshot(candidates, 'gpt-4')
    expect(trace.chain).toHaveLength(1)
    expect(trace.chain[0].kind).toBe('single')
    expect(trace.chain[0].candidates).toHaveLength(1)
    expect(trace.chain[0].candidates[0].candidateIndex).toBe(0)
  })

  it('splits primary and backup into separate chain steps, primary first', () => {
    const candidates = [
      {
        ...baseCandidate,
        instance: { id: 'i-p', name: 'inst-primary', priority: 1 },
        provider: { id: 'p-1', name: 'openai' },
        group: { id: 'g-primary', name: 'primary-group', displayName: 'Primary' },
        chainStep: 'primary',
      },
      {
        ...baseCandidate,
        instance: { id: 'i-b', name: 'inst-backup', priority: 2 },
        provider: { id: 'p-2', name: 'anthropic' },
        group: { id: 'g-backup', name: 'backup-group', displayName: 'Backup' },
        chainStep: 'backup',
      },
    ] as unknown as RouteResult[]
    const trace = buildRouteChainSnapshot(candidates, 'gpt-4')
    expect(trace.chain).toHaveLength(2)
    expect(trace.chain[0].kind).toBe('primary')
    expect(trace.chain[1].kind).toBe('backup')
    expect(trace.chain[0].candidates[0].chainStepKind).toBe('primary')
    expect(trace.chain[1].candidates[0].chainStepKind).toBe('backup')
    expect(trace.chain[0].candidates[0].candidateIndex).toBe(0)
    expect(trace.chain[1].candidates[0].candidateIndex).toBe(1)
  })

  it('includes matchedRule metadata when provided', () => {
    const trace = buildRouteChainSnapshot([], 'gpt-4', undefined, {
      id: 'rule-1',
      name: 'GPT Rule',
      priority: 10,
    })
    expect(trace.matchedRule).toEqual({
      id: 'rule-1',
      name: 'GPT Rule',
      priority: 10,
      conditions: undefined,
    })
  })

  it('carries the condition chain onto matchedRule (routing trace condition-node visibility)', () => {
    // 跟 intentName/capabilities 一样，条件节点走过哪几条 condition 之前也没传出去，
    // routing-traces 页面看不到"为什么命中了这条规则"。
    const trace = buildRouteChainSnapshot([], 'gpt-4', undefined, {
      id: 'rule-1',
      name: 'Streaming Rule',
      priority: 10,
      conditions: [{ field: 'context.streaming', operator: 'eq', value: true }],
    })
    expect(trace.matchedRule?.conditions).toEqual([
      { field: 'context.streaming', operator: 'eq', value: true },
    ])
  })

  it('omits matchedRule when not provided', () => {
    const trace = buildRouteChainSnapshot([], 'gpt-4')
    expect(trace.matchedRule).toBeUndefined()
  })

  it('carries intentName/intentSource onto the chain step (routing trace intent visibility)', () => {
    const candidates = [
      {
        ...baseCandidate,
        instance: { id: 'i-1', name: 'inst-1', priority: 10 },
        group: { id: 'g-coding', name: 'coding-group', displayName: 'Coding' },
        intentName: 'coding',
        intentSource: 'classifier',
      },
    ] as unknown as RouteResult[]
    const trace = buildRouteChainSnapshot(candidates, 'my-assistant')
    expect(trace.chain[0].intentName).toBe('coding')
    expect(trace.chain[0].intentSource).toBe('classifier')
  })

  it('carries capabilities onto the chain step for capability routing', () => {
    const candidates = [
      {
        ...baseCandidate,
        instance: { id: 'i-1', name: 'inst-1', priority: 10 },
        group: { id: 'g-vision', name: 'vision-group', displayName: 'Vision' },
        capabilities: ['vision'],
      },
    ] as unknown as RouteResult[]
    const trace = buildRouteChainSnapshot(candidates, 'my-assistant')
    expect(trace.chain[0].capabilities).toEqual(['vision'])
  })

  it('still nests intentName correctly when intent routing sits behind a fallback chain', () => {
    // 回归用例：生产环境曾出现 intent 节点被套在 fallback 主备链的 primary 分支下，
    // 修 model_routes 迁移 bug 时顺带发现路由链快照从没把 intentName 传出去，
    // 导致 routing-traces 页面看不到"这次是意图分类命中了 X"这条关键信息。
    const candidates = [
      {
        ...baseCandidate,
        instance: { id: 'i-primary', name: 'inst-primary', priority: 1 },
        group: { id: 'g-coding', name: 'coding-group', displayName: 'Coding' },
        chainStep: 'primary',
        intentName: 'coding',
        intentSource: 'classifier',
      },
      {
        ...baseCandidate,
        instance: { id: 'i-backup', name: 'inst-backup', priority: 2 },
        group: { id: 'g-backup', name: 'backup-group', displayName: 'Backup' },
        chainStep: 'backup',
      },
    ] as unknown as RouteResult[]
    const trace = buildRouteChainSnapshot(candidates, 'my-assistant')
    expect(trace.chain[0].kind).toBe('primary')
    expect(trace.chain[0].intentName).toBe('coding')
    expect(trace.chain[1].kind).toBe('backup')
    expect(trace.chain[1].intentName).toBeUndefined()
  })

  it('candidateIndex is monotonically increasing across steps', () => {
    const candidates = [
      {
        ...baseCandidate,
        instance: { id: 'i-1', name: 'a', priority: 1 },
        provider: { id: 'p-1', name: 'openai' },
        chainStep: 'primary',
      },
      {
        ...baseCandidate,
        instance: { id: 'i-2', name: 'b', priority: 2 },
        provider: { id: 'p-2', name: 'azure' },
        chainStep: 'primary',
      },
      {
        ...baseCandidate,
        instance: { id: 'i-3', name: 'c', priority: 3 },
        provider: { id: 'p-3', name: 'anthropic' },
        chainStep: 'backup',
      },
    ] as unknown as RouteResult[]
    const trace = buildRouteChainSnapshot(candidates, 'gpt-4')
    const all = trace.chain.flatMap((s) => s.candidates)
    expect(all.map((c) => c.candidateIndex)).toEqual([0, 1, 2])
    expect(all[0].chainStepKind).toBe('primary')
    expect(all[1].chainStepKind).toBe('primary')
    expect(all[2].chainStepKind).toBe('backup')
  })
})
