/**
 * 密钥用量统计的回归测试。
 *
 * 覆盖修复前的四类缺陷（每项都对应一个真实故障模式，不是实现细节）：
 *
 * 1. **区间视图丢失 key** —— 修复前 `period != 'all'` 直接从 `request_logs` 聚合，
 *    本期无请求的 key 在结果里**缺席**，前端 `stats.get(id)` 得 undefined →
 *    表格显示「从未使用 / -」，切标签页等于换一套数据。
 * 2. **`all` 视图统计恒为 0** —— 修复前该分支读 `virtual_keys` 累计列并把
 *    success/failure/token/avgResponseTime **硬编码为 0**，面板切「全部」时
 *    成功率恒 0%、平均响应时间恒 `-`。
 * 3. **改名拆分同一 key** —— `groupBy(virtualKeyId, virtualKeyName)` 带快照字段，
 *    改名后同一 keyId 返回多行，前端以 virtualKeyId 建 Map 导致后者覆盖前者。
 * 4. **`lastUsedAt` 漏记** —— 受 `inputTokens>0 && outputTokens>0` 门禁，
 *    单边 token 的请求（缓存命中/纯 output/thinking-only/embedding/取消的流）
 *    只落日志不刷新「最近使用」。
 *
 * 另有 soft-delete 过滤与时间戳格式两项断言。
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import {
  setupCrudTest,
  teardownCrudTest,
  authPost,
  type CrudTestContext,
} from '../../test/crud-helper'
import { getDatabase } from '../../db/client'
import { eq, requestLogs, virtualKeys } from '@xartifact/x-herald-db'
import { touchKeyLastUsed } from './usage-tracker'
import { getKeyStats } from '../logs/services/log-query'

let ctx: CrudTestContext

/** request_logs 的最小合法行；只填非空约束必需的列 */
function logRow(keyId: string, keyName: string, overrides: Record<string, unknown> = {}) {
  return {
    requestGroupId: crypto.randomUUID(),
    virtualKeyId: keyId,
    virtualKeyName: keyName,
    modelName: 'stats-test-model',
    status: 'success',
    responseTimeMs: 100,
    requestCategory: 'chat',
    createdAt: new Date(),
    ...overrides,
  } as never
}

async function createKey(prefix: string): Promise<{ id: string; name: string }> {
  const res = await authPost(ctx, '/api/keys', { name: `${prefix}-${Date.now()}` })
  return ((await res.json()) as { data: { id: string; name: string } }).data
}

describe('key usage stats', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })
  afterAll(async () => {
    await teardownCrudTest()
  })

  it('每个周期视图都列出全部密钥，本期无请求的 key 也保留（数值为 0）', async () => {
    const key = await createKey('periods')
    const db = getDatabase()
    // 仅 30 天前的流量：修复前该 key 在 today/7d 里完全缺席
    await db.insert(requestLogs).values(
      logRow(key.id, key.name, {
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      }),
    )

    for (const period of ['today', '7d', '30d', 'all']) {
      const stats = await getKeyStats(period)
      const found = stats.find((s) => s.virtualKeyId === key.id)
      expect(found).toBeDefined()

      // today/7d 无流量 → 计数为 0，但 key 必须在
      if (period === 'today' || period === '7d') {
        expect(found!.requestCount).toBe(0)
      }
    }
  })

  it('all 与区间视图口径一致，不再硬编码 0', async () => {
    const key = await createKey('consistent')
    const db = getDatabase()
    await db.insert(requestLogs).values(
      logRow(key.id, key.name, {
        responseTimeMs: 1234,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      }),
    )

    const all = (await getKeyStats('all')).find((s) => s.virtualKeyId === key.id)!
    const sevenDay = (await getKeyStats('7d')).find((s) => s.virtualKeyId === key.id)!

    expect(all.requestCount).toBe(sevenDay.requestCount)
    expect(all.successCount).toBe(sevenDay.successCount)
    expect(all.avgResponseTimeMs).toBe(sevenDay.avgResponseTimeMs)
    expect(all.totalTokens).toBe(sevenDay.totalTokens)

    // 且是真实值而非 0
    expect(all.successCount).toBe(1)
    expect(all.avgResponseTimeMs).toBe(1234)
    expect(all.totalInputTokens).toBe(100)
    expect(all.totalOutputTokens).toBe(50)
  })

  it('区间视图正确区分成功与失败计数', async () => {
    const key = await createKey('statuses')
    const db = getDatabase()
    await db
      .insert(requestLogs)
      .values([
        logRow(key.id, key.name),
        logRow(key.id, key.name, { status: 'failure', responseTimeMs: 500 }),
      ])

    const stats = (await getKeyStats('7d')).find((s) => s.virtualKeyId === key.id)!
    expect(stats.requestCount).toBe(2)
    expect(stats.successCount).toBe(1)
    expect(stats.failureCount).toBe(1)
  })

  it('密钥改名后仍只返回一行（不按名字快照拆分）', async () => {
    const key = await createKey('renamed')
    const db = getDatabase()
    // 同一个 keyId，历史日志里留有两个不同的名字快照
    await db
      .insert(requestLogs)
      .values([
        logRow(key.id, 'old-name', { responseTimeMs: 10 }),
        logRow(key.id, 'old-name', { responseTimeMs: 20 }),
        logRow(key.id, 'new-name', { responseTimeMs: 30 }),
      ])

    const rows = (await getKeyStats('7d')).filter((s) => s.virtualKeyId === key.id)
    expect(rows.length).toBe(1)
    expect(rows[0].requestCount).toBe(3)
  })

  it('lastUsedAt 为 ISO-8601 UTC 格式，且不受运行时本地时区影响', async () => {
    const key = await createKey('timestamp')
    const before = Date.now()
    await touchKeyLastUsed(key.id)

    const stats = (await getKeyStats('all')).find((s) => s.virtualKeyId === key.id)!
    expect(stats.lastUsedAt).not.toBeNull()

    // 必须带 Z 后缀 —— 修复前区间视图返回无时区标记的裸字符串，
    // 前端 new Date() 会按本地时区解释（UTC+8 机器上偏 8 小时）
    expect(stats.lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)

    // 关键：解析回来的时刻贴近真实写入时刻
    const deltaMs = Math.abs(new Date(stats.lastUsedAt!).getTime() - before)
    expect(deltaMs).toBeLessThan(60_000)
  })

  it('「最近使用」不依赖 token 用量：单边 token 的请求也会刷新', async () => {
    const key = await createKey('lastused')
    const db = getDatabase()

    const initial = (await db.select().from(virtualKeys)).find((k) => k.id === key.id)
    expect(initial?.lastUsedAt).toBeNull()

    // 认证路径的记录调用（与 token 无关）
    await touchKeyLastUsed(key.id)

    const touched = (await db.select().from(virtualKeys)).find((k) => k.id === key.id)
    expect(touched?.lastUsedAt).not.toBeNull()
  })

  it('软删除的密钥不出现在统计中', async () => {
    const key = await createKey('softdeleted')
    const db = getDatabase()
    await db.update(virtualKeys).set({ deletedAt: new Date() }).where(eq(virtualKeys.id, key.id))

    const stats = await getKeyStats('all')
    expect(stats.find((s) => s.virtualKeyId === key.id)).toBeUndefined()
  })
})
