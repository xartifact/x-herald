/**
 * @dagrejs/dagre 导入测试
 * 验证依赖安装正确性：导入 + 关键 API 可用性
 */

import dagre, { graphlib, Graph, layout } from '@dagrejs/dagre'

describe('@dagrejs/dagre', () => {
  describe('default export', () => {
    it('应该有 graphlib 属性', () => {
      expect(dagre.graphlib).toBeDefined()
      expect(typeof dagre.graphlib.Graph).toBe('function')
    })

    it('应该有 layout 函数', () => {
      expect(typeof dagre.layout).toBe('function')
    })

    it('应该有 version 字符串', () => {
      expect(typeof dagre.version).toBe('string')
      expect(dagre.version.length).toBeGreaterThan(0)
    })
  })

  describe('named export: graphlib', () => {
    it('应该有 Graph 构造函数', () => {
      expect(typeof graphlib.Graph).toBe('function')
    })

    it('应该能创建 Graph 实例并添加节点和边', () => {
      const g = new graphlib.Graph()
      g.setNode('a', { label: 'A', width: 100, height: 50 })
      g.setNode('b', { label: 'B', width: 100, height: 50 })
      g.setEdge('a', 'b')

      expect(g.nodeCount()).toBe(2)
      expect(g.edgeCount()).toBe(1)
      expect(g.hasNode('a')).toBe(true)
      expect(g.hasNode('b')).toBe(true)
    })

    it('非 compound 图的 graph() 应返回 undefined', () => {
      const g = new graphlib.Graph()
      expect(g.graph()).toBeUndefined()
      expect(g.isCompound()).toBe(false)
    })
  })

  describe('named export: Graph', () => {
    it('应该是 graphlib.Graph 的别名', () => {
      expect(Graph).toBe(graphlib.Graph)
    })

    it('应该能直接用 Graph 构造函数创建图', () => {
      const g = new Graph()
      g.setNode('x')
      expect(g.hasNode('x')).toBe(true)
    })
  })

  describe('named export: layout', () => {
    it('应该是 dagre.layout 的别名', () => {
      expect(layout).toBe(dagre.layout)
    })

    /**
     * dagre.layout() 要求 compound graph 且必须调用 setGraph({})。
     * 这是 dagre v3 的已知行为：非 compound 图的 graph() 返回 undefined，
     * layout 内部访问 e.graph().width 会导致 TypeError。
     */
    it('应该能对单节点图执行布局 (compound + setGraph)', () => {
      const g = new graphlib.Graph({ compound: true })
      g.setGraph({ rankdir: 'TB' })
      g.setNode('a', { width: 100, height: 50 })

      dagre.layout(g)

      const nodeA = g.node('a')
      expect(typeof nodeA.x).toBe('number')
      expect(typeof nodeA.y).toBe('number')
    })

    /**
     * 链式布局验证：a → b → c
     * 布局后节点 y 坐标应递增 (TB 方向)，x 坐标应对齐。
     * 注意：setEdge 必须提供 label 对象 (至少为空 {})，否则布局会崩溃。
     */
    it('应该能对多节点链式图执行布局并验证坐标递增', () => {
      const g = new graphlib.Graph({ compound: true })
      g.setGraph({ rankdir: 'TB' })
      g.setNode('a', { width: 100, height: 50 })
      g.setNode('b', { width: 100, height: 50 })
      g.setNode('c', { width: 100, height: 50 })
      g.setEdge('a', 'b', {})
      g.setEdge('b', 'c', {})

      dagre.layout(g)

      const nodeA = g.node('a')
      const nodeB = g.node('b')
      const nodeC = g.node('c')

      expect(typeof nodeA.x).toBe('number')
      expect(typeof nodeA.y).toBe('number')
      expect(typeof nodeB.x).toBe('number')
      expect(typeof nodeB.y).toBe('number')
      expect(typeof nodeC.x).toBe('number')
      expect(typeof nodeC.y).toBe('number')

      // 验证链式布局中 b 在 a 和 c 之间 (TB 方向，y 坐标递增)
      expect(nodeA.y).toBeLessThan(nodeB.y)
      expect(nodeB.y).toBeLessThan(nodeC.y)
    })

    /**
     * API 契约验证：非 compound 图调用 layout 应报错
     */
    it('非 compound 图调用 layout 应抛出 TypeError', () => {
      const g = new graphlib.Graph()
      g.setNode('a', { width: 100, height: 50 })

      expect(() => dagre.layout(g)).toThrow(TypeError)
    })

    /**
     * API 契约验证：未调用 setGraph 的 compound 图调用 layout 应报错
     */
    it('未调用 setGraph 的 compound 图调用 layout 应抛出 TypeError', () => {
      const g = new graphlib.Graph({ compound: true })
      g.setNode('a', { width: 100, height: 50 })

      expect(() => dagre.layout(g)).toThrow(TypeError)
    })

    it('应对多分支图执行布局 (Y 形: root → left, root → right)', () => {
      const g = new graphlib.Graph({ compound: true })
      g.setGraph({ rankdir: 'TB' })
      g.setNode('root', { width: 120, height: 60 })
      g.setNode('left', { width: 100, height: 50 })
      g.setNode('right', { width: 100, height: 50 })
      g.setEdge('root', 'left', {})
      g.setEdge('root', 'right', {})

      dagre.layout(g)

      const root = g.node('root')
      const left = g.node('left')
      const right = g.node('right')

      expect(typeof root.x).toBe('number')
      expect(typeof root.y).toBe('number')
      expect(typeof left.x).toBe('number')
      expect(typeof right.x).toBe('number')

      // root 在上方，子节点在下方
      expect(root.y).toBeLessThan(left.y)
      expect(root.y).toBeLessThan(right.y)

      // 左右节点应在不同 x 坐标
      expect(left.x).not.toBe(right.x)
    })
  })

  describe('empty graph', () => {
    it('应该能对空 compound 图执行布局而不报错', () => {
      const g = new graphlib.Graph({ compound: true })
      g.setGraph({})
      dagre.layout(g)
      expect(g.nodeCount()).toBe(0)
    })
  })
})
