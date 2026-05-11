import React from 'react'

import { mock, describe, test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

mock.module('@xyflow/react', () => ({
  Handle: function MockHandle(props: any) {
    return React.createElement('div', { 'data-handle-type': props.type })
  },
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}))

mock.module('lucide-react', () => ({
  Layers: function MockLayers() { return null },
  Server: function MockServer() { return null },
}))

mock.module('@xyflow/react/dist/style.css', () => ({}))

const { TargetNode } = await import('./features/model-routes/components/nodes/target-node')

describe('TargetNode SSR smoke test', () => {
  test('renders without crashing', () => {
    const html = renderToStaticMarkup(
      React.createElement(TargetNode, {
        data: {
          label: '实例',
          targetType: 'model_instance',
          targetName: 'gpt-4o',
          ruleName: 'Test Rule',
        },
      } as any)
    )
    expect(html).toContain('Test Rule')
  })
})
