import { Hono } from 'hono'

import { getRoutingTraceDetail, listRoutingTraces } from './service'

const routes = new Hono()

/**
 * GET /api/v1/admin/routing-traces
 *
 * Query:
 *   - modelName: 客户端原始模型名
 *   - matchedRuleId: 命中规则 ID
 *   - outcome: success | rejected | all_failed
 *   - hasFailover: 是否触发跨 provider 降级 (routeChain 包含 backup step)
 *   - startDate / endDate: ISO 时间范围
 *   - virtualKeyId
 *   - pageSize (默认 20)
 *   - cursor
 */
routes.get('/', async (c) => {
  const modelName = c.req.query('modelName') || undefined
  const matchedRuleId = c.req.query('matchedRuleId') || undefined
  const outcome = c.req.query('outcome') || undefined
  const virtualKeyId = c.req.query('virtualKeyId') || undefined
  const startDate = c.req.query('startDate') || undefined
  const endDate = c.req.query('endDate') || undefined
  const hasFailover = c.req.query('hasFailover') === 'true'
  const pageSize = Number(c.req.query('pageSize') ?? '20')
  const cursor = c.req.query('cursor') || undefined

  if (!['success', 'rejected', 'all_failed', undefined].includes(outcome as any)) {
    return c.json({ error: 'Invalid outcome', code: 'INVALID_OUTCOME' }, 400)
  }

  const result = await listRoutingTraces({
    modelName,
    matchedRuleId,
    outcome: outcome as 'success' | 'rejected' | 'all_failed' | undefined,
    virtualKeyId,
    startDate,
    endDate,
    hasFailover,
    pageSize: Math.min(Math.max(1, pageSize), 100),
    cursor,
  })

  return c.json({
    items: result.items,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  })
})

/**
 * GET /api/v1/admin/routing-traces/:logId
 *
 * 返回完整链路 + 每个候选的实际 outcome（从 request_attempts join）
 */
routes.get('/:logId', async (c) => {
  const logId = c.req.param('logId')
  const detail = await getRoutingTraceDetail(logId)
  if (!detail) {
    return c.json({ error: 'Routing trace not found or has no chain', code: 'NOT_FOUND' }, 404)
  }
  return c.json(detail)
})

export default routes
