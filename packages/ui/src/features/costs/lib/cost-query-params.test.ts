import { afterEach, describe, expect, it } from 'vitest'

import { toCostQueryParams } from './cost-query-params'

// 回归背景：曾发送裸 `YYYY-MM-DD`，后端 `new Date('YYYY-MM-DD')` 解析为 UTC 零点，
// “今天”窗口退化为单个瞬间、当天记录全部被 `createdAt <= endDate` 排除。
// 固定 TZ 后断言字面 ISO 值，保证本地日 → 含端点的 UTC 瞬间转换正确。

describe('toCostQueryParams', () => {
  afterEach(() => {
    process.env.TZ = 'UTC'
  })

  it('空过滤条件不产生参数', () => {
    process.env.TZ = 'UTC'
    expect(toCostQueryParams({})).toEqual({})
  })

  it('date-only 展开为含端点的整本地日（UTC）', () => {
    process.env.TZ = 'UTC'
    expect(toCostQueryParams({ startDate: '2026-10-12', endDate: '2026-10-12' })).toEqual({
      startDate: '2026-10-12T00:00:00.000Z',
      endDate: '2026-10-12T23:59:59.999Z',
    })
  })

  it('当天 10:00 落库的记录落在窗口内（修复前的空结果回归）', () => {
    process.env.TZ = 'UTC'
    const { startDate, endDate } = toCostQueryParams({
      startDate: '2026-10-12',
      endDate: '2026-10-12',
    })
    const record = new Date('2026-10-12T10:00:00Z').getTime()
    expect(record >= new Date(startDate!).getTime()).toBe(true)
    expect(record <= new Date(endDate!).getTime()).toBe(true)
  })

  it('按本地日历日投影，而非 UTC 日（Asia/Shanghai）', () => {
    process.env.TZ = 'Asia/Shanghai'
    expect(toCostQueryParams({ startDate: '2026-10-12', endDate: '2026-10-12' })).toEqual({
      startDate: '2026-10-11T16:00:00.000Z',
      endDate: '2026-10-12T15:59:59.999Z',
    })
    // 上海时间 10-12 10:00 = 02:00Z，修复前 endDate=10-12T00:00Z 会排除它
    const record = new Date('2026-10-12T02:00:00Z').getTime()
    const { startDate, endDate } = toCostQueryParams({
      startDate: '2026-10-12',
      endDate: '2026-10-12',
    })
    expect(record >= new Date(startDate!).getTime()).toBe(true)
    expect(record <= new Date(endDate!).getTime()).toBe(true)
  })

  it('只传起始日时仅生成 startDate', () => {
    process.env.TZ = 'UTC'
    expect(toCostQueryParams({ startDate: '2026-10-01' })).toEqual({
      startDate: '2026-10-01T00:00:00.000Z',
    })
  })
})
