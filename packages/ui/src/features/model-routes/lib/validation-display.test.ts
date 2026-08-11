import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'

import {
  FLOW_NODE_INVALID_CLASS,
  decorateNodesWithValidation,
  groupValidationErrors,
} from './validation-display'

describe('validation-display', () => {
  it('groups messages by nodeId', () => {
    const map = groupValidationErrors([
      { nodeId: 'a', message: 'm1' },
      { nodeId: 'a', message: 'm2' },
      { nodeId: 'b', message: 'm3' },
    ])
    expect(map.get('a')).toEqual(['m1', 'm2'])
    expect(map.get('b')).toEqual(['m3'])
  })

  it('decorates invalid nodes and strips class when clean', () => {
    const nodes: Node[] = [
      { id: 'a', type: 'target', position: { x: 0, y: 0 }, data: {} },
      {
        id: 'b',
        type: 'target',
        position: { x: 0, y: 0 },
        data: {},
        className: FLOW_NODE_INVALID_CLASS,
      },
    ]
    const decorated = decorateNodesWithValidation(nodes, [
      { nodeId: 'a', message: '目标节点未配置动作或目标' },
    ])
    expect(decorated[0]!.className).toContain(FLOW_NODE_INVALID_CLASS)
    expect(decorated[1]!.className ?? '').not.toContain(FLOW_NODE_INVALID_CLASS)

    const clean = decorateNodesWithValidation(decorated, [])
    expect(clean[0]!.className ?? '').not.toContain(FLOW_NODE_INVALID_CLASS)
  })
})
