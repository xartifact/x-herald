import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'

import { validateFlow } from './compile-flow'

function n(id: string, type: string, data: Record<string, unknown> = {}): Node {
  return { id, type, position: { x: 0, y: 0 }, data }
}

function e(id: string, source: string, target: string, sourceHandle?: string): Edge {
  return { id, source, target, sourceHandle }
}

describe('validateFlow (Phase 6 FE)', () => {
  it('flags orphan nodes not reachable from any modelTrigger', () => {
    const nodes = [
      n('vm-1', 'modelTrigger', { label: 'vm' }),
      n('t1', 'target', { actionType: 'route_to_group', targetId: 'g1' }),
      n('orphan', 'target', { actionType: 'route_to_group', targetId: 'g2' }),
    ]
    const edges = [e('e1', 'vm-1', 't1')]
    const errors = validateFlow(nodes, edges)
    expect(errors.some((err) => err.nodeId === 'orphan' && err.message.includes('孤立'))).toBe(true)
  })

  it('flags cycles', () => {
    const nodes = [
      n('a', 'condition', { field: 'request.model', operator: 'eq', value: 'x' }),
      n('b', 'condition', { field: 'request.model', operator: 'eq', value: 'y' }),
    ]
    const edges = [e('e1', 'a', 'b', 'true'), e('e2', 'b', 'a', 'true')]
    const errors = validateFlow(nodes, edges)
    expect(errors.some((err) => err.message.includes('循环'))).toBe(true)
  })

  it('flags invalid sourceHandle on intent', () => {
    const nodes = [
      n('i1', 'intent', {
        intentConfig: { categories: ['billing'] },
      }),
      n('t1', 'target', { actionType: 'route_to_group', targetId: 'g1' }),
    ]
    const edges = [e('e1', 'i1', 't1', 'handle-missing')]
    const errors = validateFlow(nodes, edges)
    expect(errors.some((err) => err.message.includes('handle-missing'))).toBe(true)
  })

  it('passes a simple valid path', () => {
    const nodes = [
      n('vm-1', 'modelTrigger', { label: 'vm' }),
      n('t1', 'target', { actionType: 'route_to_group', targetId: 'g1' }),
    ]
    const edges = [e('e1', 'vm-1', 't1')]
    expect(validateFlow(nodes, edges)).toEqual([])
  })
})
