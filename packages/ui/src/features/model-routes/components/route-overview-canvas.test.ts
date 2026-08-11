import { describe, expect, it } from 'vitest'

import type { AccessModelRouteOverview } from '@xartifact/x-llm-gateway-shared'

import { buildOverviewGraph } from './route-overview-canvas'

function am(
  id: string,
  name: string,
  graph: AccessModelRouteOverview[number]['graph'],
): AccessModelRouteOverview[number] {
  return { accessModel: { id, name, displayName: null, enabled: true }, rule: null, graph }
}

describe('buildOverviewGraph', () => {
  it('为每个接入模型生成列头节点并命名空间化子图节点/边（防止跨列 id 冲突）', () => {
    const graph = {
      nodes: [
        { id: 'vm', type: 'modelTrigger', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: 'tgt', type: 'target', position: { x: 200, y: 40 }, data: { label: '目标' } },
      ],
      edges: [{ id: 'e1', source: 'vm', target: 'tgt' }],
    } as AccessModelRouteOverview[number]['graph']

    const { nodes, edges } = buildOverviewGraph([
      {
        accessModel: { id: 'am1', name: 'Model A', displayName: null, enabled: true },
        rule: { id: 'r1', version: 2, active: true },
        graph,
      },
    ])

    expect(nodes.some((n) => n.id === 'am-am1')).toBe(true) // 列头
    const tgt = nodes.find((n) => n.id === 'am1::tgt')
    expect(tgt).toBeTruthy()
    expect(tgt!.position.x).toBeGreaterThan(0) // 列偏移
    expect(edges[0].source).toBe('am1::vm')
    expect(edges[0].target).toBe('am1::tgt')
  })

  it('无路由规则的接入模型生成占位 modelTrigger 节点', () => {
    const { nodes } = buildOverviewGraph([am('am2', 'B', { nodes: [], edges: [] })])
    expect(nodes.some((n) => n.id === 'vm-am2' && n.type === 'modelTrigger')).toBe(true)
  })

  it('不同接入模型的同名子节点 id 不冲突', () => {
    const g = {
      nodes: [{ id: 'x', type: 'modelTrigger', position: { x: 0, y: 0 }, data: { label: 'x' } }],
      edges: [],
    } as AccessModelRouteOverview[number]['graph']
    const { nodes } = buildOverviewGraph([am('a1', 'A', g), am('a2', 'B', g)])
    expect(nodes.filter((n) => n.id.endsWith('::x')).length).toBe(2)
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length)
  })

  it('负偏移子图被 dagre 归一化到列原点，不侵入相邻分组', () => {
    const g = {
      nodes: [
        { id: 'vm', type: 'modelTrigger', position: { x: -300, y: 0 }, data: { label: 'A' } },
        { id: 't', type: 'target', position: { x: -120, y: 200 }, data: { label: '目标' } },
      ],
      edges: [{ id: 'e1', source: 'vm', target: 't' }],
    } as AccessModelRouteOverview[number]['graph']
    // 前一列是占位列，后一列是负偏移图 —— 验证图内容不会向左侵入前一列
    const { nodes } = buildOverviewGraph([
      am('a0', 'X', { nodes: [], edges: [] }),
      am('a1', 'A', g),
    ])
    const vm = nodes.find((n) => n.id === 'a1::vm')!
    const t = nodes.find((n) => n.id === 'a1::t')!
    const prevPlaceholder = nodes.find((n) => n.id === 'vm-a0')!
    // dagre 重排 + 归一化后：本列内容从列起点开始（不再有 -300 偏移）
    expect(vm.position.x).toBeGreaterThanOrEqual(0)
    expect(t.position.x).toBeGreaterThanOrEqual(0)
    // 且整列内容都在前一列占位节点右侧（不重叠）
    expect(vm.position.x).toBeGreaterThan(prevPlaceholder.position.x + 160)
  })

  it('多分支宽图被 dagre TB 压缩，保留拓扑且不跨列', () => {
    const g = {
      nodes: [
        { id: 'vm', type: 'modelTrigger', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: 'c', type: 'condition', position: { x: 200, y: 150 }, data: { label: '条件' } },
        { id: 't1', type: 'target', position: { x: 500, y: 300 }, data: { label: '目标1' } },
        { id: 't2', type: 'target', position: { x: 800, y: 300 }, data: { label: '目标2' } },
      ],
      edges: [
        { id: 'e1', source: 'vm', target: 'c' },
        { id: 'e2', source: 'c', sourceHandle: 'match', target: 't1' },
        { id: 'e3', source: 'c', sourceHandle: 'else', target: 't2' },
      ],
    } as AccessModelRouteOverview[number]['graph']
    const { nodes, edges } = buildOverviewGraph([
      am('a1', 'A', g),
      am('a2', 'B', { nodes: [], edges: [] }),
    ])
    // 拓扑保留：节点与边一个不少
    expect(nodes.filter((n) => n.id.startsWith('a1::')).length).toBe(4)
    expect(edges.length).toBe(3)
    // 与下一列（占位）不重叠
    const amNodes = nodes.filter((n) => n.id.startsWith('a1::'))
    const maxX = Math.max(...amNodes.map((n) => n.position.x))
    const next = nodes.find((n) => n.id === 'vm-a2')!
    expect(maxX).toBeLessThan(next.position.x)
  })

  it('相邻列按内容宽度贪心推进，列间不重叠', () => {
    const narrow = {
      nodes: [
        { id: 'vm', type: 'modelTrigger', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: 't', type: 'target', position: { x: 300, y: 200 }, data: { label: '目标' } },
      ],
      edges: [{ id: 'e1', source: 'vm', target: 't' }],
    } as AccessModelRouteOverview[number]['graph']
    const wide = {
      nodes: [
        { id: 'vm', type: 'modelTrigger', position: { x: 0, y: 0 }, data: { label: 'B' } },
        { id: 'c', type: 'condition', position: { x: 200, y: 150 }, data: { label: '条件' } },
        { id: 't1', type: 'target', position: { x: 500, y: 300 }, data: { label: '目标1' } },
        { id: 't2', type: 'target', position: { x: 800, y: 300 }, data: { label: '目标2' } },
      ],
      edges: [
        { id: 'e1', source: 'vm', target: 'c' },
        { id: 'e2', source: 'c', sourceHandle: 'match', target: 't1' },
        { id: 'e3', source: 'c', sourceHandle: 'else', target: 't2' },
      ],
    } as AccessModelRouteOverview[number]['graph']
    const { nodes } = buildOverviewGraph([am('a1', 'A', narrow), am('a2', 'B', wide)])
    const colA = nodes.filter((n) => n.id.startsWith('a1::'))
    const colB = nodes.filter((n) => n.id.startsWith('a2::'))
    const aRight = Math.max(...colA.map((n) => n.position.x + 200))
    const bLeft = Math.min(...colB.map((n) => n.position.x))
    expect(bLeft).toBeGreaterThan(aRight)
    // 窄列（简单链）按内容宽推进，不应被 360 下限撑出大片空白
    const narrowColWidth = bLeft - colA[0]!.position.x - 24 // 减去列间距
    expect(narrowColWidth).toBeLessThan(360)
  })

  it('多分类 intent 节点按真实渲染宽度推进列宽，不侵入相邻分组', () => {
    // 4 个分类的 intent 实际渲染宽度 = max(160, (4+1)*80+32) = 432
    const g = {
      nodes: [
        { id: 'vm', type: 'modelTrigger', position: { x: 0, y: 0 }, data: { label: 'A' } },
        {
          id: 'i',
          type: 'intent',
          position: { x: 60, y: 120 },
          data: {
            label: '意图路由',
            intentConfig: { categories: ['a', 'b', 'c', 'd'] },
          },
        },
        { id: 't', type: 'target', position: { x: 0, y: 300 }, data: { label: '目标' } },
      ],
      edges: [
        { id: 'e1', source: 'vm', target: 'i' },
        { id: 'e2', source: 'i', sourceHandle: 'handle-a', target: 't' },
      ],
    } as AccessModelRouteOverview[number]['graph']
    const { nodes } = buildOverviewGraph([
      am('a1', 'A', g),
      am('a2', 'B', { nodes: [], edges: [] }),
    ])
    const intent = nodes.find((n) => n.id === 'a1::i')!
    const intentRight = intent.position.x + 432 // 真实渲染宽度
    const next = nodes.find((n) => n.id === 'vm-a2')!
    // 意图节点右边缘必须落在下一列内容起点之前（不重叠）
    expect(intentRight).toBeLessThanOrEqual(next.position.x)
  })
})
