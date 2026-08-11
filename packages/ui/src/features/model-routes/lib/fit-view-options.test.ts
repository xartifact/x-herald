import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'

import {
  computeFitViewOptions,
  computeGraphStats,
  pickFitTier,
  shouldRefit,
} from './fit-view-options'

function node(id: string, x: number, y: number, width = 200, height = 80): Node {
  return { id, position: { x, y }, width, height, data: {} }
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target }
}

describe('computeGraphStats', () => {
  it('空图返回零维度 + 正确的边数', () => {
    expect(computeGraphStats([], [])).toEqual({ nodeCount: 0, edgeCount: 0, width: 0, height: 0 })
  })

  it('单个节点的包围盒尺寸 = 节点 width/height', () => {
    const stats = computeGraphStats([node('a', 0, 0, 150, 60)], [])
    expect(stats).toEqual({ nodeCount: 1, edgeCount: 0, width: 150, height: 60 })
  })

  it('多个节点的包围盒覆盖所有节点（包含负坐标）', () => {
    const nodes = [node('a', -100, -50, 200, 80), node('b', 300, 200, 100, 50)]
    const stats = computeGraphStats(nodes, [])
    // a: x=[-100, 100] y=[-50, 30]; b: x=[300, 400] y=[200, 250]
    // bounding: x=[-100, 400] → width=500, y=[-50, 250] → height=300
    expect(stats.width).toBe(500)
    expect(stats.height).toBe(300)
  })

  it('节点没有 width/height 时使用默认 200x80', () => {
    const stats = computeGraphStats([{ id: 'a', position: { x: 0, y: 0 }, data: {} }], [])
    expect(stats.width).toBe(200)
    expect(stats.height).toBe(80)
  })

  it('边数独立统计', () => {
    const nodes = [node('a', 0, 0), node('b', 300, 0)]
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')]
    expect(computeGraphStats(nodes, edges).edgeCount).toBe(2)
  })
})

describe('pickFitTier', () => {
  it.each([
    [0, 0.5, 1.5],
    [1, 0.3, 1.5],
    [2, 0.2, 1.2],
    [5, 0.2, 1.2],
    [6, 0.15, 1.0],
    [20, 0.15, 1.0],
    [21, 0.1, 0.8],
    [50, 0.1, 0.8],
    [51, 0.05, 0.5],
    [500, 0.05, 0.5],
  ])('%i 节点 → padding=%f, maxZoom=%f', (count, expectedPadding, expectedMaxZoom) => {
    const tier = pickFitTier(count)
    expect(tier.padding).toBe(expectedPadding)
    expect(tier.maxZoom).toBe(expectedMaxZoom)
  })
})

describe('computeFitViewOptions', () => {
  it('始终设置 200ms 动画时长', () => {
    const opts = computeFitViewOptions([], [])
    expect(opts.duration).toBe(200)
  })

  it('空画布 padding 较大、允许最大 zoom', () => {
    const opts = computeFitViewOptions([], [])
    // 0 节点：padding={top:0.5,right:0.5,bottom:0.5,left:0.5}
    expect(opts.padding).toEqual({ top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 })
    expect(opts.maxZoom).toBe(1.5)
  })

  it('单节点：标准 tier（不触发横/纵 elongation）', () => {
    const opts = computeFitViewOptions([node('a', 0, 0, 200, 80)], [])
    expect(opts.padding).toEqual({ top: 0.3, right: 0.3, bottom: 0.3, left: 0.3 })
    expect(opts.maxZoom).toBe(1.5)
    expect(opts.minZoom).toBe(0.5)
  })

  it('2-5 节点 → padding 0.2, maxZoom 1.2', () => {
    const nodes = [node('a', 0, 0), node('b', 300, 0), node('c', 0, 200), node('d', 300, 200)]
    const opts = computeFitViewOptions(nodes, [])
    expect(opts.padding).toEqual({ top: 0.2, right: 0.2, bottom: 0.2, left: 0.2 })
    expect(opts.maxZoom).toBe(1.2)
  })

  it('6-20 节点 → padding 0.15, maxZoom 1.0', () => {
    // 4x3 网格（约方形布局），避免触发 elongation boost
    const nodes = Array.from({ length: 12 }, (_, i) =>
      node(`n${i}`, (i % 4) * 220, Math.floor(i / 4) * 120),
    )
    const opts = computeFitViewOptions(nodes, [])
    expect(opts.padding).toEqual({ top: 0.15, right: 0.15, bottom: 0.15, left: 0.15 })
    expect(opts.maxZoom).toBe(1.0)
  })

  it('21-50 节点 → padding 0.1, maxZoom 0.8', () => {
    // 6x5 网格（约方形布局）
    const nodes = Array.from({ length: 30 }, (_, i) =>
      node(`n${i}`, (i % 6) * 220, Math.floor(i / 6) * 120),
    )
    const opts = computeFitViewOptions(nodes, [])
    expect(opts.padding).toEqual({ top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 })
    expect(opts.maxZoom).toBe(0.8)
  })

  it('50+ 节点 → padding 0.05, maxZoom 0.5', () => {
    const nodes = Array.from({ length: 80 }, (_, i) =>
      node(`n${i}`, (i % 8) * 100, Math.floor(i / 8) * 100),
    )
    const opts = computeFitViewOptions(nodes, [])
    expect(opts.padding).toEqual({ top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 })
    expect(opts.maxZoom).toBe(0.5)
  })

  it('水平拉长的图（width/height > 3）→ 左右 padding +0.15', () => {
    // 5 节点，全部 y=0 排列 → 横向长条
    const nodes = [
      node('a', 0, 0),
      node('b', 300, 0),
      node('c', 600, 0),
      node('d', 900, 0),
      node('e', 1200, 0),
    ]
    // width = 1400, height = 80 → aspect = 17.5
    const opts = computeFitViewOptions(nodes, [])
    // tier padding 0.2, 左右各 +0.15 → 0.35；上下保持 0.2
    expect(opts.padding).toEqual({ top: 0.2, right: 0.35, bottom: 0.2, left: 0.35 })
  })

  it('垂直拉长的图（height/width > 3，即 aspect < 0.33）→ 上下 padding +0.15', () => {
    // 5 节点，x 一致垂直堆叠
    const nodes = [
      node('a', 0, 0),
      node('b', 0, 300),
      node('c', 0, 600),
      node('d', 0, 900),
      node('e', 0, 1200),
    ]
    // width = 200, height = 1280 → aspect = 0.156
    const opts = computeFitViewOptions(nodes, [])
    expect(opts.padding).toEqual({ top: 0.35, right: 0.2, bottom: 0.35, left: 0.2 })
  })

  it('aspect 在 [0.33, 3] 之间 → 不触发 elongation boost', () => {
    // 2 节点纵向堆叠，aspect 约 1.4（不在 elongation 范围内）
    const nodes = [node('a', 0, 0, 200, 80), node('b', 0, 200, 200, 80)]
    // width=200, height=280 → aspect ≈ 0.71, 在 [0.33, 3]
    const opts = computeFitViewOptions(nodes, [])
    expect(opts.padding).toEqual({ top: 0.2, right: 0.2, bottom: 0.2, left: 0.2 })
  })
})

describe('shouldRefit', () => {
  const baseStats = { nodeCount: 3, edgeCount: 2, width: 600, height: 200 }

  it('prev 为 null（首次）→ 必须 refit', () => {
    expect(shouldRefit(null, baseStats)).toBe(true)
  })

  it('节点数变化 → refit', () => {
    expect(shouldRefit(baseStats, { ...baseStats, nodeCount: 4 })).toBe(true)
    expect(shouldRefit(baseStats, { ...baseStats, nodeCount: 2 })).toBe(true)
  })

  it('纯属性编辑（节点数/边数/包围盒都不变）→ 不 refit', () => {
    expect(shouldRefit(baseStats, { ...baseStats })).toBe(false)
  })

  it('边数小幅变化（绝对值 <3 且比例 <20%）→ 不 refit', () => {
    // 10 → 11 = +1 边，绝对值 < 3 且 +10% < 20%
    const stats = { ...baseStats, edgeCount: 10 }
    expect(shouldRefit(stats, { ...stats, edgeCount: 11 })).toBe(false)
  })

  it('边数大幅增加（>=3）→ refit', () => {
    expect(shouldRefit(baseStats, { ...baseStats, edgeCount: 6 })).toBe(true)
  })

  it('边数相对变化 >=20% → refit', () => {
    // 2 → 3 = +50% 但绝对值 < 3：上一条覆盖了这条的情况
    // 用 10 条边的 base 测：10 → 13 = +30%
    const stats = { ...baseStats, edgeCount: 10 }
    expect(shouldRefit(stats, { ...stats, edgeCount: 13 })).toBe(true)
  })

  it('包围盒宽度增大 >25% → refit', () => {
    expect(shouldRefit(baseStats, { ...baseStats, width: 800 })).toBe(true)
  })

  it('包围盒高度缩小 >25% → refit', () => {
    expect(shouldRefit(baseStats, { ...baseStats, height: 100 })).toBe(true)
  })

  it('包围盒小幅调整（<=25%）→ 不 refit', () => {
    expect(shouldRefit(baseStats, { ...baseStats, width: 700, height: 220 })).toBe(false)
  })

  it('prev 是零尺寸图（初次进入空画布）→ 永远 refit 因为 nodeCount 可能仍是 0 但 current 有内容', () => {
    const empty = { nodeCount: 0, edgeCount: 0, width: 0, height: 0 }
    expect(shouldRefit(empty, baseStats)).toBe(true)
  })
})
