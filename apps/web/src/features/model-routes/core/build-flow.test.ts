import { test, expect, describe, afterEach } from 'bun:test'

import { buildFlowFromData } from './build-flow'
import { compileFlowToRoutes } from './compile-flow'
import type { ModelRoute } from '../types'

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
    virtualModelIds: ['vm1'],
    conditions: [
      { field: 'request.model', operator: 'eq' as const, value: 'gpt-4' },
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
    virtualModelIds: ['vm2'],
    conditions: [],
    action: { type: 'fallback' },
    priority: 20,
    enabled: true,
    flowData: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
]

describe('buildFlowFromData → compileFlowToRoutes integration', () => {
  afterEach(() => {
    // No global state to clean up
  })

  test('produces nodes with non-zero positions after dagre layout', () => {
    const { nodes, edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    // Must have nodes at all
    expect(nodes.length).toBeGreaterThan(0)

    // Not all positions should be {x: 0, y: 0} — dagre MUST assign real positions
    const allZero = nodes.every(
      n => n.position.x === 0 && n.position.y === 0,
    )
    expect(allZero).toBe(false)

    // At least some nodes must have x > 0 or y > 0
    const hasNonZeroPosition = nodes.some(
      n => n.position.x !== 0 || n.position.y !== 0,
    )
    expect(hasNonZeroPosition).toBe(true)
  })

  test('produces VM entry nodes for each virtual model', () => {
    const { nodes } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    const vmNodes = nodes.filter(n => n.type === 'modelTrigger')
    expect(vmNodes.length).toBe(2)

    const vmIds = vmNodes.map(n => (n.data as any).vmId).sort()
    expect(vmIds).toEqual(['vm1', 'vm2'])
  })

  test('produces condition nodes for routes with conditions', () => {
    const { nodes } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    const condNodes = nodes.filter(n => n.type === 'condition')
    // Route r1 has 1 condition; r2 has 0
    expect(condNodes.length).toBe(1)

    const condData = condNodes[0].data as any
    expect(condData.field).toBe('request.model')
    expect(condData.operator).toBe('eq')
    expect(condData.value).toBe('gpt-4')
    expect(condData.routeId).toBe('r1')
  })

  test('produces target node for route_to_group action', () => {
    const { nodes } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    const targetNodes = nodes.filter(n => n.type === 'target')
    expect(targetNodes.length).toBe(1)

    const targetData = targetNodes[0].data as any
    expect(targetData.actionType).toBe('route_to_group')
    expect(targetData.targetId).toBe('group1')
    expect(targetData.targetName).toBe('Premium Models')
    expect(targetData.routeId).toBe('r1')
  })

  test('produces fallback node for route with fallback action', () => {
    const { nodes } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    const fallbackNodes = nodes.filter(n => n.type === 'fallback')
    expect(fallbackNodes.length).toBe(1)

    const fallbackData = fallbackNodes[0].data as any
    expect(fallbackData.routeId).toBe('r2')
  })

  test('edges have correct sourceHandle for condition chains', () => {
    const { edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    // Edges from VM to first condition should NOT have sourceHandle
    const vmToCondEdges = edges.filter(
      e => e.source.startsWith('vm-') && e.target.startsWith('cond-'),
    )
    for (const edge of vmToCondEdges) {
      expect(edge.sourceHandle).toBeUndefined()
    }

    // Edges from condition to target (sourceHandle === 'true') should exist
    const condToTargetTrue = edges.filter(
      e => e.sourceHandle === 'true' && e.source.startsWith('cond-'),
    )
    expect(condToTargetTrue.length).toBeGreaterThan(0)
  })

  test('edges connect VM nodes to condition nodes', () => {
    const { edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    const vmToCondEdges = edges.filter(
      e => e.source.startsWith('vm-') && e.target.startsWith('cond-'),
    )
    expect(vmToCondEdges.length).toBeGreaterThan(0)

    // Should connect vm-vm1 to cond for route r1
    const vm1Edges = vmToCondEdges.filter(e => e.source === 'vm-vm1')
    expect(vm1Edges.length).toBe(1)
  })

  test('edges connect VM directly to leaf when conditions are empty', () => {
    const { edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    // r2 has no conditions, so vm-vm2 → fallback leaf
    const vmToFallback = edges.filter(
      e => e.source === 'vm-vm2' && e.target.startsWith('fallback-'),
    )
    expect(vmToFallback.length).toBe(1)
  })

  test('compileFlowToRoutes consumes buildFlowFromData output without errors', () => {
    const { nodes, edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    // Should not throw
    const routes = compileFlowToRoutes(nodes, edges)

    // Must produce payloads
    expect(routes.length).toBeGreaterThan(0)

    // Each payload must have required fields
    for (const route of routes) {
      expect(route.name).toBeDefined()
      expect(typeof route.name).toBe('string')
      expect(route.name.length).toBeGreaterThan(0)
      expect(route.action).toBeDefined()
      expect(route.enabled).toBe(true)
    }
  })

  test('compiled routes include action types matching original routes', () => {
    const { nodes, edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)
    const routes = compileFlowToRoutes(nodes, edges)

    const actionTypes = routes.map(r => r.action.type)

    // Must contain both fallback and route_to_group
    expect(actionTypes).toContain('route_to_group')
    expect(actionTypes).toContain('fallback')
  })

  test('compiled routes assign sequential priorities (0, 10, 20, ...)', () => {
    const { nodes, edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)
    const routes = compileFlowToRoutes(nodes, edges)

    for (let i = 0; i < routes.length; i++) {
      expect(routes[i].priority).toBe(i * 10)
    }
  })

  test('round-trip: buildFlowFromData → compileFlowToRoutes preserves route count', () => {
    // Both r1 (with condition) and r2 (no conditions) should be recovered
    const { nodes, edges } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)
    const routes = compileFlowToRoutes(nodes, edges)

    // At least 2 distinct paths: one for route_to_group, one for fallback
    expect(routes.length).toBeGreaterThanOrEqual(2)
  })

  test('empty routes input produces empty flow', () => {
    const { nodes, edges } = buildFlowFromData([], TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    // VM nodes still generated, but no edges
    expect(nodes.length).toEqual(TEST_VMS.length)
    expect(edges).toEqual([])
  })

  test('node positions have variety (not all on same row or column)', () => {
    const { nodes } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    const yValues = nodes.map(n => n.position.y)
    const uniqueY = new Set(yValues)

    // TB layout should have multiple y layers
    expect(uniqueY.size).toBeGreaterThan(1)
  })

  test('VM nodes are positioned at the top (smallest y values)', () => {
    const { nodes } = buildFlowFromData(TEST_ROUTES, TEST_VMS, TEST_GROUPS, TEST_INSTANCES)

    const vmNodes = nodes.filter(n => n.type === 'modelTrigger')
    const vmYValues = vmNodes.map(n => n.position.y)
    const allOtherY = nodes
      .filter(n => n.type !== 'modelTrigger')
      .map(n => n.position.y)

    // VM nodes should be at the top (lower y) than non-VM nodes
    if (vmYValues.length > 0 && allOtherY.length > 0) {
      const maxVmY = Math.max(...vmYValues)
      const minOtherY = Math.min(...allOtherY)
      expect(maxVmY).toBeLessThanOrEqual(minOtherY)
    }
  })
})
