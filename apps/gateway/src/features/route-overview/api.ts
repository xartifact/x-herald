import { Hono } from 'hono'

import { getRouteOverview } from '../route-rules/service'

/**
 * 全局路由俯瞰图：聚合所有接入模型的路由规则到一个图形画布的总览端点。
 * 只读、无参数，返回所有接入模型及其 active 路由规则图。
 */
const overviewRoutes = new Hono()

overviewRoutes.get('/', async (c) => {
  const data = await getRouteOverview()
  return c.json({ success: true, data })
})

export default overviewRoutes
