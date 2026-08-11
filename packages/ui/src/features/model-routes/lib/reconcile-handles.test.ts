import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'

import {
  annotateInvalidEdges,
  getCategoryList,
  getDefaultHandleId,
  getValidSourceHandles,
  pruneOrphanedEdges,
} from './reconcile-handles'

function intentNode(id: string, categories: string[]): Node {
  return {
    id,
    type: 'intent',
    position: { x: 0, y: 0 },
    data: { intentConfig: { categories } },
  }
}

function capabilityNode(id: string, capabilities: string[]): Node {
  return {
    id,
    type: 'capability',
    position: { x: 0, y: 0 },
    data: { capabilityConfig: { capabilities } },
  }
}

function edgeFrom(handle: string, sourceId = 'n1', targetId = 't1'): Edge {
  return {
    id: `e-${sourceId}-${handle}-${targetId}`,
    source: sourceId,
    target: targetId,
    sourceHandle: handle,
  }
}

describe('getCategoryList', () => {
  it('returns categories from intent node data', () => {
    const list = getCategoryList({ intentConfig: { categories: ['a', 'b'] } }, 'intent')
    expect(list).toEqual(['a', 'b'])
  })
  it('returns capabilities from capability node data', () => {
    const list = getCategoryList({ capabilityConfig: { capabilities: ['vision'] } }, 'capability')
    expect(list).toEqual(['vision'])
  })
  it('returns undefined for non-dynamic types', () => {
    expect(getCategoryList({}, 'condition')).toBeUndefined()
  })
  it('returns undefined when missing', () => {
    expect(getCategoryList({}, 'intent')).toBeUndefined()
  })
})

describe('getDefaultHandleId', () => {
  it('returns handle-default for intent', () => {
    expect(getDefaultHandleId({}, 'intent')).toBe('handle-default')
  })
  it('returns handle-default for capability', () => {
    expect(getDefaultHandleId({}, 'capability')).toBe('handle-default')
  })
  it('returns undefined for condition', () => {
    expect(getDefaultHandleId({}, 'condition')).toBeUndefined()
  })
})

describe('getValidSourceHandles', () => {
  it('returns true/false for condition nodes', () => {
    const node: Node = { id: 'c', type: 'condition', position: { x: 0, y: 0 }, data: {} }
    const handles = getValidSourceHandles(node)
    expect(handles.has('true')).toBe(true)
    expect(handles.has('false')).toBe(true)
  })
  it('returns handle-category and handle-default for intent with categories', () => {
    const node = intentNode('i', ['greeting', 'billing'])
    const handles = getValidSourceHandles(node)
    expect(handles.has('handle-greeting')).toBe(true)
    expect(handles.has('handle-billing')).toBe(true)
    expect(handles.has('handle-default')).toBe(true)
  })
  it('always includes handle-default even with no categories', () => {
    const node = intentNode('i', [])
    const handles = getValidSourceHandles(node)
    expect(handles.has('handle-default')).toBe(true)
    expect(handles.size).toBe(1)
  })
  it('returns empty set for nodes with no handles', () => {
    const node: Node = { id: 't', type: 'target', position: { x: 0, y: 0 }, data: {} }
    const handles = getValidSourceHandles(node)
    expect(handles.size).toBe(0)
  })
})

describe('pruneOrphanedEdges', () => {
  it('returns edges unchanged for non-intent/capability nodes', () => {
    const node: Node = { id: 'c', type: 'condition', position: { x: 0, y: 0 }, data: {} }
    const edges: Edge[] = [{ id: 'e1', source: 'c', target: 't1', sourceHandle: 'true' }]
    const result = pruneOrphanedEdges(node, {}, edges)
    expect(result).toEqual(edges)
  })
  it('deletes edges for removed categories', () => {
    const old = intentNode('i', ['greeting', 'billing'])
    const edges: Edge[] = [edgeFrom('handle-greeting', 'i'), edgeFrom('handle-billing', 'i')]
    const result = pruneOrphanedEdges(old, { intentConfig: { categories: ['greeting'] } }, edges)
    expect(result.length).toBe(1)
    expect(result[0]!.sourceHandle).toBe('handle-greeting')
  })
  it('keeps handle-default edge across category removal', () => {
    const old = intentNode('i', ['greeting'])
    const edges: Edge[] = [edgeFrom('handle-greeting', 'i'), edgeFrom('handle-default', 'i')]
    const result = pruneOrphanedEdges(old, { intentConfig: { categories: [] } }, edges)
    expect(result.length).toBe(1)
    expect(result[0]!.sourceHandle).toBe('handle-default')
  })
  it('adds new edges for new categories do not affect existing', () => {
    const old = intentNode('i', ['greeting'])
    const edges: Edge[] = [edgeFrom('handle-greeting', 'i')]
    const result = pruneOrphanedEdges(
      old,
      { intentConfig: { categories: ['greeting', 'newcat'] } },
      edges,
    )
    expect(result).toEqual(edges)
  })
})

describe('annotateInvalidEdges', () => {
  it('does not mark edges from nodes without handle validation', () => {
    const nodes: Node[] = [
      { id: 'vm', type: 'modelTrigger', position: { x: 0, y: 0 }, data: {} },
      { id: 't1', type: 'target', position: { x: 0, y: 0 }, data: {} },
    ]
    const edges: Edge[] = [{ id: 'e1', source: 'vm', target: 't1' }]
    const result = annotateInvalidEdges(nodes, edges)
    expect(result[0]!.data).toBeUndefined()
  })
  it('marks edges pointing to non-existent handles as invalid', () => {
    const nodes: Node[] = [
      intentNode('i', ['greeting']),
      { id: 't1', type: 'target', position: { x: 0, y: 0 }, data: {} },
    ]
    const edges: Edge[] = [
      edgeFrom('handle-removed', 'i', 't1'),
      edgeFrom('handle-greeting', 'i', 't1'),
    ]
    const result = annotateInvalidEdges(nodes, edges)
    expect(result[0]!.data).toMatchObject({ invalidHandle: true })
    expect(result[1]!.data).toBeUndefined()
  })
  it('leaves handle-default edges unmarked even when other handles missing', () => {
    const nodes: Node[] = [
      intentNode('i', ['greeting']),
      { id: 't1', type: 'target', position: { x: 0, y: 0 }, data: {} },
    ]
    const edges: Edge[] = [edgeFrom('handle-default', 'i', 't1')]
    const result = annotateInvalidEdges(nodes, edges)
    expect(result[0]!.data).toBeUndefined()
  })
})
