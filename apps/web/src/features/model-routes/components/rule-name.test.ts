import { describe, test, expect, mock, beforeEach } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// ============================================================
// MOCKS — must be defined BEFORE importing the modules under test.
// Use explicit named exports instead of Proxy — bun:test's
// mock.module does not correctly intercept Proxy-based getters
// for named imports from ESM modules like lucide-react.
// ============================================================

let capturedNodes: any[] = []
let capturedEdges: any[] = []

function MockIcon(props: any) {
  return React.createElement('svg', props)
}

mock.module('lucide-react', () => ({
  Server: MockIcon,
  Layers: MockIcon,
  GitBranch: MockIcon,
  Network: MockIcon,
  Ban: MockIcon,
}))

mock.module('@xyflow/react', () => ({
  Handle: function MockHandle(props: any) {
    return React.createElement('div', { 'data-handle-type': props.type })
  },
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  ReactFlow: function MockReactFlow(props: any) {
    capturedNodes = props.nodes ?? []
    capturedEdges = props.edges ?? []
    return React.createElement('div', { 'data-testid': 'react-flow' })
  },
  Controls: function MockControls() {
    return React.createElement('div', null)
  },
  Background: function MockBackground() {
    return React.createElement('div', null)
  },
  BackgroundVariant: { Dots: 'dots' },
  useNodesState: (initial: any) => [initial, () => {}, () => {}],
  useEdgesState: (initial: any) => [initial, () => {}, () => {}],
  addEdge: () => [],
}))

mock.module('@xyflow/react/dist/style.css', () => ({}))

// ============================================================
// Dynamic imports — evaluated AFTER mock.module registrations
// ============================================================

const { TargetNode } = await import('./nodes/target-node')
const { FlowEditor } = await import('./flow-editor')

// ============================================================
// Helpers
// ============================================================

function makeRoute(overrides: Record<string, any> = {}) {
  return {
    id: 'route-1',
    name: 'Test Rule',
    description: null,
    virtualModelId: 'vm-1',
    conditions: [] as any[],
    action: { type: 'route_to_instance' as const, targetId: 'inst-1' },
    priority: 1,
    enabled: true,
    flowData: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeVm(id = 'vm-1', name = 'gpt-4', displayName = 'GPT-4') {
  return { id, name, displayName }
}

function makeGroup(id = 'grp-1', name = 'fast', displayName = 'Fast Models') {
  return { id, name, displayName }
}

function makeInstance(id = 'inst-1', name = 'gpt-4o-mini') {
  return { id, name }
}

function renderFlowEditor(
  routes: any[],
  opts: { vms?: any[]; groups?: any[]; instances?: any[] } = {}
) {
  capturedNodes = []
  capturedEdges = []
  renderToStaticMarkup(
    React.createElement(FlowEditor, {
      routes,
      vms: opts.vms ?? [makeVm()],
      groups: opts.groups ?? [],
      instances: opts.instances ?? [makeInstance()],
    })
  )
}

function getTargetNode(): any {
  return capturedNodes.find((n: any) => n.type === 'target')
}

// ============================================================
// TargetNode component tests
// ============================================================

describe('TargetNode — ruleName rendering', () => {
  test('renders ruleName text when ruleName is a non-empty string', () => {
    const html = renderToStaticMarkup(
      React.createElement(TargetNode, {
        data: {
          label: '实例',
          targetType: 'model_instance',
          targetName: 'gpt-4o',
          ruleName: 'Premium Users Rule',
        },
      } as any)
    )
    expect(html).toContain('Premium Users Rule')
  })

  test('renders ruleName above targetName in DOM order', () => {
    const html = renderToStaticMarkup(
      React.createElement(TargetNode, {
        data: {
          label: '实例',
          targetType: 'model_instance',
          targetName: 'gpt-4o',
          ruleName: 'My Rule Name',
        },
      } as any)
    )
    const rulePos = html.indexOf('My Rule Name')
    const targetPos = html.indexOf('gpt-4o')
    expect(rulePos).toBeGreaterThan(-1)
    expect(targetPos).toBeGreaterThan(-1)
    expect(rulePos).toBeLessThan(targetPos)
  })

  test('does NOT render ruleName section when ruleName is undefined', () => {
    const html = renderToStaticMarkup(
      React.createElement(TargetNode, {
        data: {
          label: '实例',
          targetType: 'model_instance',
          targetName: 'gpt-4o',
        },
      } as any)
    )
    expect(html).not.toContain('text-muted-foreground')
    expect(html).not.toContain('undefined')
  })

  test('does NOT render ruleName section when ruleName is empty string', () => {
    const html = renderToStaticMarkup(
      React.createElement(TargetNode, {
        data: {
          label: '实例',
          targetType: 'model_instance',
          targetName: 'gpt-4o',
          ruleName: '',
        },
      } as any)
    )
    expect(html).not.toContain('text-muted-foreground')
  })

  test('ruleName container has truncate class for overflow', () => {
    const html = renderToStaticMarkup(
      React.createElement(TargetNode, {
        data: {
          label: '实例',
          targetType: 'model_instance',
          targetName: 'gpt-4o',
          ruleName: 'Long Rule Name',
        },
      } as any)
    )
    expect(html).toContain('truncate')
  })

  test('ruleName container has max-w-[180px] for width constraint', () => {
    const html = renderToStaticMarkup(
      React.createElement(TargetNode, {
        data: {
          label: '实例',
          targetType: 'model_instance',
          targetName: 'gpt-4o',
          ruleName: 'Some Rule',
        },
      } as any)
    )
    expect(html).toContain('max-w-[180px]')
  })

  test('renders targetName correctly when no ruleName present', () => {
    const html = renderToStaticMarkup(
      React.createElement(TargetNode, {
        data: {
          label: '实例',
          targetType: 'model_instance',
          targetName: 'claude-3.5',
        },
      } as any)
    )
    expect(html).toContain('claude-3.5')
  })
})

// ============================================================
// buildFlowFromData — ruleName propagation (tested through FlowEditor)
// ============================================================

describe('buildFlowFromData — ruleName propagation', () => {
  beforeEach(() => {
    capturedNodes = []
    capturedEdges = []
  })

  test('passes ruleName for conditional routes (with conditions)', () => {
    const routes = [
      makeRoute({
        id: 'r1',
        name: 'Premium Users Rule',
        conditions: [
          { field: 'user.tier', operator: 'eq', value: 'premium' },
        ],
        action: { type: 'route_to_instance', targetId: 'inst-1' },
      }),
    ]

    renderFlowEditor(routes)

    const target = getTargetNode()
    expect(target).toBeDefined()
    expect(target.data.ruleName).toBe('Premium Users Rule')
    expect(target.data.targetName).toBe('gpt-4o-mini')
  })

  test('passes ruleName for unconditional routes (no conditions)', () => {
    const routes = [
      makeRoute({
        id: 'r2',
        name: 'Default Route',
        conditions: [],
        action: { type: 'route_to_group', targetId: 'grp-1' },
      }),
    ]

    renderFlowEditor(routes, { groups: [makeGroup()] })

    const target = getTargetNode()
    expect(target).toBeDefined()
    expect(target.data.ruleName).toBe('Default Route')
  })

  test('uses 未命名规则 fallback when route.name is empty string', () => {
    const routes = [
      makeRoute({
        id: 'r3',
        name: '',
        conditions: [
          { field: 'region', operator: 'eq', value: 'us' },
        ],
        action: { type: 'route_to_instance', targetId: 'inst-1' },
      }),
    ]

    renderFlowEditor(routes)

    const target = getTargetNode()
    expect(target).toBeDefined()
    expect(target.data.ruleName).toBe('未命名规则')
  })

  test('uses 未命名规则 fallback when route.name is null', () => {
    const routes = [
      makeRoute({
        id: 'r4',
        name: null,
        conditions: [
          { field: 'model', operator: 'eq', value: 'gpt-4' },
        ],
        action: { type: 'route_to_instance', targetId: 'inst-1' },
      }),
    ]

    renderFlowEditor(routes)

    const target = getTargetNode()
    expect(target).toBeDefined()
    expect(target.data.ruleName).toBe('未命名规则')
  })

  test('reject action does not produce a target node', () => {
    const routes = [
      makeRoute({
        id: 'r5',
        name: 'Block Banned Users',
        conditions: [
          { field: 'user.banned', operator: 'eq', value: true },
        ],
        action: { type: 'reject', reason: 'Account suspended' },
      }),
    ]

    renderFlowEditor(routes)

    const target = getTargetNode()
    expect(target).toBeUndefined()

    const rejectNode = capturedNodes.find((n: any) => n.type === 'reject')
    expect(rejectNode).toBeDefined()
    expect(rejectNode.data.label).toBe('拒绝')
  })

  test('unconditional route with empty name also gets 未命名规则', () => {
    const routes = [
      makeRoute({
        id: 'r6',
        name: '',
        conditions: [],
        action: { type: 'route_to_instance', targetId: 'inst-1' },
      }),
    ]

    renderFlowEditor(routes)

    const target = getTargetNode()
    expect(target).toBeDefined()
    expect(target.data.ruleName).toBe('未命名规则')
  })

  test('multiple routes each get their own ruleName', () => {
    const routes = [
      makeRoute({
        id: 'ra',
        name: 'First Rule',
        conditions: [{ field: 'a', operator: 'eq', value: '1' }],
        action: { type: 'route_to_instance', targetId: 'inst-1' },
      }),
      makeRoute({
        id: 'rb',
        name: 'Second Rule',
        conditions: [{ field: 'b', operator: 'eq', value: '2' }],
        action: { type: 'route_to_instance', targetId: 'inst-1' },
      }),
    ]

    renderFlowEditor(routes)

    const targets = capturedNodes.filter((n: any) => n.type === 'target')
    expect(targets.length).toBe(2)
    const ruleNames = targets.map((t: any) => t.data.ruleName)
    expect(ruleNames).toEqual(['First Rule', 'Second Rule'])
  })

  test('ruleName uses route_to_group action correctly', () => {
    const routes = [
      makeRoute({
        id: 'r7',
        name: 'Group Fallback',
        virtualModelId: 'vm-1',
        conditions: [],
        action: { type: 'route_to_group', targetId: 'grp-1' },
      }),
    ]

    renderFlowEditor(routes, { groups: [makeGroup()] })

    const target = getTargetNode()
    expect(target).toBeDefined()
    expect(target.data.ruleName).toBe('Group Fallback')
    expect(target.data.targetType).toBe('group')
  })

  test('ruleName uses route_to_virtual_model action correctly', () => {
    const routes = [
      makeRoute({
        id: 'r8',
        name: 'VM Redirect',
        virtualModelId: 'vm-1',
        conditions: [],
        action: { type: 'route_to_virtual_model', targetId: 'vm-2' },
      }),
    ]

    renderFlowEditor(routes, {
      vms: [makeVm('vm-1'), makeVm('vm-2', 'claude', 'Claude')],
    })

    const target = getTargetNode()
    expect(target).toBeDefined()
    expect(target.data.ruleName).toBe('VM Redirect')
    expect(target.data.targetType).toBe('virtual_model')
    expect(target.data.targetName).toBe('Claude')
  })
})
