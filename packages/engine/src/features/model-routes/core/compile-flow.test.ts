import { describe, it, expect } from 'bun:test'
import type { Node, Edge } from '@xyflow/react'
import { compileFlowToRoutes, validateFlow } from './compile-flow'
import { buildFlowFromData } from './build-flow'
import type { ModelRoute } from '../types'

function createMockNode(id: string, type: string = 'modelTrigger', overrides: Record<string, unknown> = {}): Node {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  } as Node
}

function createMockEdge(source: string, target: string, overrides: Record<string, unknown> = {}): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    ...overrides,
  } as Edge
}

describe('validateFlow', () => {
  it('returns empty array for empty nodes', () => {
    expect(validateFlow([], [])).toEqual([])
  })

  it('returns no errors for valid condition node', () => {
    const nodes = [
      createMockNode('c1', 'condition', {
        data: { field: 'request.model', operator: 'eq' },
      }),
    ]
    expect(validateFlow(nodes, [])).toEqual([])
  })

  it('returns error when condition node lacks field', () => {
    const nodes = [
      createMockNode('c1', 'condition', {
        data: { operator: 'eq' },
      }),
    ]
    expect(validateFlow(nodes, [])).toEqual([
      { nodeId: 'c1', message: '条件节点未配置字段或操作符' },
    ])
  })

  it('returns error when condition node lacks operator', () => {
    const nodes = [
      createMockNode('c1', 'condition', {
        data: { field: 'request.model' },
      }),
    ]
    expect(validateFlow(nodes, [])).toEqual([
      { nodeId: 'c1', message: '条件节点未配置字段或操作符' },
    ])
  })

  it('returns error when condition node lacks both field and operator', () => {
    const nodes = [
      createMockNode('c1', 'condition', {
        data: {},
      }),
    ]
    expect(validateFlow(nodes, [])).toEqual([
      { nodeId: 'c1', message: '条件节点未配置字段或操作符' },
    ])
  })

  it('returns no errors for valid target node', () => {
    const nodes = [
      createMockNode('t1', 'target', {
        data: { actionType: 'route_to_group', targetId: 'group1' },
      }),
    ]
    expect(validateFlow(nodes, [])).toEqual([])
  })

  it('returns error when target node lacks actionType', () => {
    const nodes = [
      createMockNode('t1', 'target', {
        data: { targetId: 'group1' },
      }),
    ]
    expect(validateFlow(nodes, [])).toEqual([
      { nodeId: 't1', message: '目标节点未配置动作或目标' },
    ])
  })

  it('returns error when target node lacks targetId', () => {
    const nodes = [
      createMockNode('t1', 'target', {
        data: { actionType: 'route_to_group' },
      }),
    ]
    expect(validateFlow(nodes, [])).toEqual([
      { nodeId: 't1', message: '目标节点未配置动作或目标' },
    ])
  })

  it('returns no errors for reject node (no required data fields)', () => {
    const nodes = [
      createMockNode('r1', 'reject', {
        data: { reason: 'quota exceeded' },
      }),
    ]
    expect(validateFlow(nodes, [])).toEqual([])
  })

  it('returns no errors for fallback node (no required data fields)', () => {
    const nodes = [
      createMockNode('f1', 'fallback', {
        data: {},
      }),
    ]
    expect(validateFlow(nodes, [])).toEqual([])
  })

  it('returns multiple errors for mixed invalid nodes', () => {
    const nodes = [
      createMockNode('c1', 'condition', { data: {} }),
      createMockNode('t1', 'target', { data: {} }),
      createMockNode('c2', 'condition', { data: { field: 'ok' } }),
    ]
    const errors = validateFlow(nodes, [])
    expect(errors).toHaveLength(3)
    expect(errors.map((e) => e.nodeId)).toContain('c1')
    expect(errors.map((e) => e.nodeId)).toContain('t1')
    expect(errors.map((e) => e.nodeId)).toContain('c2')
  })

  it('ignores modelTrigger nodes', () => {
    const nodes = [
      createMockNode('vm1', 'modelTrigger', { data: {} }),
    ]
    expect(validateFlow(nodes, [])).toEqual([])
  })

  it('ignores unknown node types', () => {
    const nodes = [
      createMockNode('x1', 'unknown', { data: {} }),
    ]
    expect(validateFlow(nodes, [])).toEqual([])
  })
})

describe('compileFlowToRoutes', () => {
  it('returns empty array for empty input', () => {
    expect(compileFlowToRoutes([], [])).toEqual([])
  })

  it('returns empty array when no VM nodes present', () => {
    const nodes = [
      createMockNode('c1', 'condition', { data: { field: 'request.model', operator: 'eq' } }),
      createMockNode('t1', 'target', { data: { actionType: 'route_to_group', targetId: 'group1' } }),
    ]
    const edges = [
      createMockEdge('c1', 't1', { sourceHandle: 'true' }),
    ]
    expect(compileFlowToRoutes(nodes, edges)).toEqual([])
  })

  it('compiles single VM to single target with no conditions', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger', { data: { vmId: 'vm1' } }),
      createMockNode('t1', 'target', { data: { actionType: 'route_to_group', targetId: 'group1', label: 'Group Route' } }),
    ]
    const edges = [createMockEdge('vm-vm1', 't1')]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes).toHaveLength(1)
    expect(routes[0].name).toBe('Group Route')
    expect(routes[0].accessModelIds).toEqual(['vm1'])
    expect(routes[0].conditions).toEqual([])
    expect(routes[0].action).toEqual({ type: 'route_to_group', targetId: 'group1' })
    expect(routes[0].priority).toBe(0)
    expect(routes[0].enabled).toBe(true)
  })

  it('compiles VM with one condition to target', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('cond-r1-0', 'condition', {
        data: { field: 'request.model', operator: 'eq', value: 'gpt-4' },
      }),
      createMockNode('target-r1', 'target', {
        data: { actionType: 'route_to_instance', targetId: 'inst1' },
      }),
    ]
    const edges = [
      createMockEdge('vm-vm1', 'cond-r1-0'),
      createMockEdge('cond-r1-0', 'target-r1', { sourceHandle: 'true' }),
    ]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes).toHaveLength(1)
    expect(routes[0].conditions).toEqual([
      { field: 'request.model', operator: 'eq', value: 'gpt-4' },
    ])
    expect(routes[0].action).toEqual({ type: 'route_to_instance', targetId: 'inst1' })
  })

  it('compiles VM with condition chain to target', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('cond-r1-0', 'condition', {
        data: { field: 'request.model', operator: 'eq', value: 'gpt-4' },
      }),
      createMockNode('cond-r1-1', 'condition', {
        data: { field: 'user.tier', operator: 'in', value: 'premium' },
      }),
      createMockNode('target-r1', 'target', {
        data: { actionType: 'route_to_virtual_model', targetId: 'vm2' },
      }),
    ]
    const edges = [
      createMockEdge('vm-vm1', 'cond-r1-0'),
      createMockEdge('cond-r1-0', 'cond-r1-1', { sourceHandle: 'true' }),
      createMockEdge('cond-r1-1', 'target-r1', { sourceHandle: 'true' }),
    ]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes).toHaveLength(1)
    expect(routes[0].conditions).toEqual([
      { field: 'request.model', operator: 'eq', value: 'gpt-4' },
      { field: 'user.tier', operator: 'in', value: 'premium' },
    ])
  })

  it('compiles reject leaf correctly', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('reject-r1', 'reject', {
        data: { reason: 'quota exceeded' },
      }),
    ]
    const edges = [createMockEdge('vm-vm1', 'reject-r1')]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes).toHaveLength(1)
    expect(routes[0].action).toEqual({ type: 'reject', reason: 'quota exceeded' })
  })

  it('compiles fallback leaf correctly', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('fallback-r1', 'fallback', { data: {} }),
    ]
    const edges = [createMockEdge('vm-vm1', 'fallback-r1')]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes).toHaveLength(1)
    expect(routes[0].action).toEqual({ type: 'fallback' })
  })

  it('merges VMs that share the same path', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('vm-vm2', 'modelTrigger'),
      createMockNode('t1', 'target', {
        data: { actionType: 'route_to_group', targetId: 'group1' },
      }),
    ]
    const edges = [
      createMockEdge('vm-vm1', 't1'),
      createMockEdge('vm-vm2', 't1'),
    ]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes).toHaveLength(1)
    expect(routes[0].accessModelIds?.sort()).toEqual(['vm1', 'vm2'])
  })

  it('produces separate routes for distinct paths from same VM', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('cond-r1-0', 'condition', {
        data: { field: 'request.model', operator: 'eq', value: 'gpt-4' },
      }),
      createMockNode('target-r1', 'target', {
        data: { actionType: 'route_to_group', targetId: 'group1' },
      }),
      createMockNode('fallback-r2', 'fallback', { data: {} }),
    ]
    const edges = [
      createMockEdge('vm-vm1', 'cond-r1-0'),
      createMockEdge('cond-r1-0', 'target-r1', { sourceHandle: 'true' }),
      createMockEdge('vm-vm1', 'fallback-r2'),
    ]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes.length).toBeGreaterThanOrEqual(2)
    const actionTypes = routes.map((r) => r.action.type)
    expect(actionTypes).toContain('route_to_group')
    expect(actionTypes).toContain('fallback')
  })

  it('assigns sequential priorities starting at 0', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('t1', 'target', { data: { actionType: 'route_to_group', targetId: 'g1' } }),
      createMockNode('t2', 'target', { data: { actionType: 'route_to_group', targetId: 'g2' } }),
    ]
    const edges = [
      createMockEdge('vm-vm1', 't1'),
      createMockEdge('vm-vm1', 't2'),
    ]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes).toHaveLength(2)
    expect(routes[0].priority).toBe(0)
    expect(routes[1].priority).toBe(10)
  })

  it('generates name from conditions when label is absent', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('cond-r1-0', 'condition', {
        data: { field: 'request.model', operator: 'eq', value: 'gpt-4' },
      }),
      createMockNode('target-r1', 'target', {
        data: { actionType: 'route_to_group', targetId: 'group1' },
      }),
    ]
    const edges = [
      createMockEdge('vm-vm1', 'cond-r1-0'),
      createMockEdge('cond-r1-0', 'target-r1', { sourceHandle: 'true' }),
    ]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes[0].name).toBe('request.model eq gpt-4')
  })

  it('generates name from action type when no conditions and no label', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('t1', 'target', {
        data: { actionType: 'route_to_group', targetId: 'group1' },
      }),
    ]
    const edges = [createMockEdge('vm-vm1', 't1')]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes[0].name).toBe('route_to_group')
  })

  it('truncates generated names to 255 characters', () => {
    const longValue = 'x'.repeat(300)
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('cond-r1-0', 'condition', {
        data: { field: 'request.model', operator: 'eq', value: longValue },
      }),
      createMockNode('target-r1', 'target', {
        data: { actionType: 'route_to_group', targetId: 'group1' },
      }),
    ]
    const edges = [
      createMockEdge('vm-vm1', 'cond-r1-0'),
      createMockEdge('cond-r1-0', 'target-r1', { sourceHandle: 'true' }),
    ]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes[0].name.length).toBe(255)
  })

  it('handles condition with exists operator (value omitted)', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('cond-r1-0', 'condition', {
        data: { field: 'headers.x-custom', operator: 'exists' },
      }),
      createMockNode('target-r1', 'target', {
        data: { actionType: 'route_to_group', targetId: 'group1' },
      }),
    ]
    const edges = [
      createMockEdge('vm-vm1', 'cond-r1-0'),
      createMockEdge('cond-r1-0', 'target-r1', { sourceHandle: 'true' }),
    ]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes[0].conditions).toEqual([
      { field: 'headers.x-custom', operator: 'exists' },
    ])
  })

  it('skips paths with unextractable action', () => {
    const nodes = [
      createMockNode('vm-vm1', 'modelTrigger'),
      createMockNode('t1', 'target', {
        data: { actionType: undefined, targetId: 'group1' },
      }),
    ]
    const edges = [createMockEdge('vm-vm1', 't1')]
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes).toEqual([])
  })
})

describe('compileFlowToRoutes round-trip', () => {
  const TEST_VMS = [
    { id: 'vm1', name: 'gpt-4', displayName: 'GPT-4' },
    { id: 'vm2', name: 'claude-3', displayName: 'Claude 3' },
  ]

  const TEST_GROUPS = [
    { id: 'group1', name: 'PremiumGroup', displayName: 'Premium Models' },
  ]

  const TEST_INSTANCES = [
    { id: 'inst1', name: 'gpt-4-turbo' },
  ]

  const TEST_ROUTES: ModelRoute[] = [
    {
      id: 'r1',
      name: 'Premium Route',
      description: null,
      accessModelIds: ['vm1'],
      conditions: [
        { field: 'request.model', operator: 'eq', value: 'gpt-4' },
      ],
      action: { type: 'route_to_group', targetId: 'group1' },
      priority: 10,
      enabled: true,
      flowData: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'r2',
      name: 'Fallback Route',
      description: null,
      accessModelIds: ['vm2'],
      conditions: [],
      action: { type: 'fallback' },
      priority: 20,
      enabled: true,
      flowData: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ]

  it('build → compile preserves action types', () => {
    const { nodes, edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)
    const routes = compileFlowToRoutes(nodes, edges)

    const actionTypes = routes.map((r) => r.action.type)
    expect(actionTypes).toContain('route_to_group')
    expect(actionTypes).toContain('fallback')
  })

  it('build → compile preserves target IDs for non-reject/fallback actions', () => {
    const { nodes, edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)
    const routes = compileFlowToRoutes(nodes, edges)

    const groupRoute = routes.find((r) => r.action.type === 'route_to_group')
    expect(groupRoute?.action).toEqual({ type: 'route_to_group', targetId: 'group1' })
  })

  it('build → compile produces at least as many routes as distinct action paths', () => {
    const { nodes, edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)
    const routes = compileFlowToRoutes(nodes, edges)

    expect(routes.length).toBeGreaterThanOrEqual(2)
  })

  it('build → compile assigns sequential priorities', () => {
    const { nodes, edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)
    const routes = compileFlowToRoutes(nodes, edges)

    for (let i = 0; i < routes.length; i++) {
      expect(routes[i].priority).toBe(i * 10)
    }
  })

  it('build → compile sets enabled to true', () => {
    const { nodes, edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)
    const routes = compileFlowToRoutes(nodes, edges)

    for (const route of routes) {
      expect(route.enabled).toBe(true)
    }
  })
})
