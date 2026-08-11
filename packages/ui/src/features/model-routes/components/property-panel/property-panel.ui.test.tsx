import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { PropertyPanel } from './index'
import type { Node } from '@xyflow/react'

function makeNode(type: string, data: Record<string, unknown> = {}): Node {
  return { id: 'n1', type, position: { x: 0, y: 0 }, data } as Node
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function withClient(node: Node | null) {
  const client = makeClient()
  return render(
    <QueryClientProvider client={client}>
      <PropertyPanel selectedNode={node} onUpdate={() => {}} />
    </QueryClientProvider>,
  )
}

describe('PropertyPanel', () => {
  it('shows empty state when no node is selected', () => {
    const { container } = withClient(null)
    expect(container.textContent).toContain('选择节点')
    expect(container.textContent).toContain('点击画布中的节点查看配置')
  })

  it('shows unknown type message for unrecognized node type', () => {
    const { container } = withClient(makeNode('weirdType', { label: 'X' }))
    expect(container.textContent).toContain('未知节点类型')
    expect(container.textContent).toContain('weirdType')
  })

  it('renders modelTrigger (vm) node with "接入模型" header', () => {
    const { container } = withClient(makeNode('modelTrigger', { label: 'TestVM' }))
    expect(container.textContent).toContain('接入模型')
  })

  it('renders condition node with "条件节点" header', () => {
    const { container } = withClient(makeNode('condition', { field: 'req.model', operator: 'eq' }))
    expect(container.textContent).toContain('条件节点')
    // RJSF Form 渲染了匹配字段、操作符等字段
    expect(container.textContent).toContain('匹配字段')
    expect(container.textContent).toContain('操作符')
  })

  it('renders target node with "目标节点" header', () => {
    const { container } = withClient(
      makeNode('target', { actionType: 'route_to_group', targetId: 'g1' }),
    )
    expect(container.textContent).toContain('目标节点')
  })

  it('renders reject node with "策略节点" header', () => {
    const { container } = withClient(makeNode('reject', { reason: 'quota exceeded' }))
    expect(container.textContent).toContain('策略节点')
  })

  it('renders fallback node with "降级链" header', () => {
    const { container } = withClient(makeNode('fallback', { reason: 'no route matched' }))
    expect(container.textContent).toContain('降级链')
  })

  it('renders intent node with "意图路由" header and 配置 form', () => {
    const { container } = withClient(
      makeNode('intent', { intentConfig: { targetGroupIds: { billing: 'g1' } } }),
    )
    expect(container.textContent).toContain('意图路由')
    // 包含意图配置相关的 label
    expect(container.textContent).toContain('意图配置')
  })

  it('renders capability node with "能力路由" header', () => {
    const { container } = withClient(
      makeNode('capability', { capabilityConfig: { capabilityMap: { vision: 'g1' } } }),
    )
    expect(container.textContent).toContain('能力路由')
    expect(container.textContent).toContain('能力配置')
  })

  it('has a close button in the header', () => {
    withClient(makeNode('modelTrigger', { label: 'X' }))
    const closeBtn = screen
      .getAllByRole('button')
      .find((b) => b.querySelector('svg.lucide-x') !== null)
    expect(closeBtn).toBeDefined()
  })

  it('close button is a regular button (not submit)', () => {
    const { container } = withClient(makeNode('modelTrigger', { label: 'X' }))
    const closeBtn = container.querySelector('button[aria-label]')
    if (closeBtn) {
      expect(closeBtn.getAttribute('type')).toBe('button')
    }
  })
})
