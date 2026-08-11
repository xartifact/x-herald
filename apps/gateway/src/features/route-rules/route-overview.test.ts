import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { accessModels, routeRules } from '@xartifact/x-llm-gateway-db'

import { getDatabase } from '../../db/client'
import { createTestEngine, destroyTestEngine } from '../../test/setup'
import { getRouteOverview } from './service'

describe('getRouteOverview', () => {
  const amWithRule = crypto.randomUUID()
  const amNoRule = crypto.randomUUID()

  beforeAll(async () => {
    await createTestEngine()
    const db = getDatabase()
    await db.insert(accessModels).values([
      { id: amWithRule, name: 'AM-A', displayName: 'AM A', enabled: true },
      { id: amNoRule, name: 'AM-B', enabled: true },
    ])
    await db.insert(routeRules).values({
      accessModelId: amWithRule,
      name: '默认路由规则',
      version: 3,
      active: true,
      graph: {
        nodes: [
          {
            id: 'vm',
            type: 'modelTrigger',
            position: { x: 0, y: 0 },
            data: { label: 'AM-A' },
          },
        ],
        edges: [],
      },
    })
  })

  afterAll(async () => {
    await destroyTestEngine()
  })

  it('返回每个接入模型及其 active 路由规则图', async () => {
    const items = await getRouteOverview()
    expect(items).toHaveLength(2)

    const withRule = items.find((i) => i.accessModel.id === amWithRule)!
    expect(withRule.accessModel.name).toBe('AM-A')
    expect(withRule.accessModel.displayName).toBe('AM A')
    expect(withRule.rule).toEqual({ id: expect.any(String), version: 3, active: true })
    expect(withRule.graph.nodes).toHaveLength(1)
    expect(withRule.graph.nodes[0].type).toBe('modelTrigger')

    const noRule = items.find((i) => i.accessModel.id === amNoRule)!
    expect(noRule.rule).toBeNull()
    expect(noRule.graph.nodes).toHaveLength(0)
  })

  it('不返回已软删除的接入模型', async () => {
    const deleted = crypto.randomUUID()
    const db = getDatabase()
    await db
      .insert(accessModels)
      .values({ id: deleted, name: 'AM-Gone', enabled: true, deletedAt: new Date() })
    const items = await getRouteOverview()
    expect(items.find((i) => i.accessModel.id === deleted)).toBeUndefined()
    expect(items).toHaveLength(2)
  })
})
