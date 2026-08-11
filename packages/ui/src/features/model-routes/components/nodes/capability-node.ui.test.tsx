import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CapabilityNode } from './capability-node'
import { ReactFlowProvider } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'

function renderNode(data: Record<string, unknown>) {
  const node: Node = { id: '1', type: 'capability', position: { x: 0, y: 0 }, data } as Node
  const props = { id: node.id, data: node.data } as unknown as NodeProps
  return render(
    <ReactFlowProvider>
      <CapabilityNode {...props} />
    </ReactFlowProvider>,
  )
}

describe('CapabilityNode', () => {
  it('renders the node label', () => {
    const { getByText } = renderNode({ label: 'Vision Router' })
    expect(getByText('Vision Router')).toBeDefined()
  })

  it('shows the capability routing badge', () => {
    const { container } = renderNode({ label: 'x' })
    expect(container.textContent).toContain('能力路由')
  })

  it('shows capability names when configured via capabilities array', () => {
    const { container } = renderNode({
      label: 'x',
      capabilityConfig: {
        capabilities: ['vision', 'tts'],
      },
    })
    expect(container.textContent).toContain('vision')
    expect(container.textContent).toContain('tts')
  })

  it('renders one source handle per capability plus handle-default', () => {
    const { container } = renderNode({
      label: 'x',
      capabilityConfig: {
        capabilities: ['vision', 'audio'],
      },
    })
    const handleEls = container.querySelectorAll('.react-flow__handle-bottom')
    expect(handleEls.length).toBe(3) // 2 capabilities + 1 default
  })
})
