import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IntentNode } from './intent-node'
import { ReactFlowProvider } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'

function renderNode(data: Record<string, unknown>) {
  const node: Node = { id: '1', type: 'intent', position: { x: 0, y: 0 }, data } as Node
  const props = { id: node.id, data: node.data } as unknown as NodeProps
  return render(
    <ReactFlowProvider>
      <IntentNode {...props} />
    </ReactFlowProvider>,
  )
}

describe('IntentNode', () => {
  it('renders the node label', () => {
    const { getByText } = renderNode({ label: 'My Intent Router' })
    expect(getByText('My Intent Router')).toBeDefined()
  })

  it('shows the intent routing badge', () => {
    const { container } = renderNode({ label: 'x' })
    expect(container.textContent).toContain('意图路由')
  })

  it('shows category count when categories are configured', () => {
    const { container } = renderNode({
      label: 'x',
      intentConfig: {
        categories: ['coding', 'translation', 'analysis'],
      },
    })
    expect(container.textContent).toContain('3 个分类')
  })

  it('renders one source handle per category plus handle-default', () => {
    const { container } = renderNode({
      label: 'x',
      intentConfig: {
        categories: ['coding', 'translation'],
      },
    })
    const handleEls = container.querySelectorAll('.react-flow__handle-bottom')
    expect(handleEls.length).toBe(3) // 2 categories + 1 default
  })

  it('always renders handle-default even without categories', () => {
    const { container } = renderNode({ label: 'x', intentConfig: { categories: [] } })
    const handleEls = container.querySelectorAll('.react-flow__handle-bottom')
    expect(handleEls.length).toBe(1)
  })

  it('shows connected handle labels with target name', () => {
    const { container } = renderNode({
      label: 'x',
      intentConfig: { categories: ['coding'] },
      _connectedHandles: ['handle-coding'],
      _handleTargets: { 'handle-coding': '模型组-A' },
    })
    expect(container.textContent).toContain('coding → 模型组-A')
  })

  it('shows unconnected label when no connection', () => {
    const { container } = renderNode({
      label: 'x',
      intentConfig: { categories: ['coding'] },
      _connectedHandles: [],
      _handleTargets: {},
    })
    expect(container.textContent).toContain('coding')
  })
})
