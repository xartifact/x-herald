import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { CanvasGraphSchema } from '@xartifact/x-llm-gateway-shared'
import type { RouteAction } from '@xartifact/x-llm-gateway-shared'

import { activateVersion, deleteVersion, getVersion, listVersions, saveDraft } from './service'
import { AppError } from '../../middleware/error'
import { getRouteRuleEngine } from '../../gateway/services/route-rule-engine'

const SaveDraftBody = z.object({
  graph: CanvasGraphSchema,
  name: z.string().optional(),
  description: z.string().nullable().optional(),
})

const routeRulesRoutes = new Hono()

function isIntentAction(
  a: RouteAction,
): a is RouteAction & { intentConfig?: Record<string, unknown> } {
  return a.type === 'intent'
}

/**
 * 这个子路由挂载在父路由的 /api/access-models/:accessModelId/route-rules 下——
 * accessModelId 是父路径段，Hono 的类型系统在跨 .route() 挂载边界时无法静态
 * 保证它一定存在，所以这里显式做运行时校验（而不是 `as string` 断言掉）。
 */
function requireAccessModelId(c: { req: { param: (name: string) => string | undefined } }): string {
  const accessModelId = c.req.param('accessModelId')
  if (!accessModelId) throw new Error('accessModelId path param missing')
  return accessModelId
}

/**
 * 这条子路由挂载在父路由的动态路径段下（/api/access-models/:accessModelId/...），
 * 这种跨 .route() 多级动态路径挂载的场景下，父级 app.use('*', errorHandler) 没有
 * 可靠捕获这里抛出的异常，所以每个可能抛业务/校验错误的 handler 显式 try/catch
 * 并直接映射响应，其余未预期异常仍继续冒泡给全局 errorHandler 兜底。
 */
function jsonAppError(c: Context, err: AppError): Response {
  const statusCode = err.statusCode === 404 ? 404 : 400
  return c.json({ success: false, error: err.message, code: err.code ?? 'ERROR' }, statusCode)
}

// GET /api/access-models/:accessModelId/route-rules — 列出全部版本
routeRulesRoutes.get('/', async (c) => {
  const versions = await listVersions(requireAccessModelId(c))
  return c.json({ success: true, data: versions })
})

// GET /api/access-models/:accessModelId/route-rules/:id — 取单个版本
routeRulesRoutes.get('/:id', async (c) => {
  const version = await getVersion(c.req.param('id'))
  if (!version) {
    return c.json({ success: false, error: 'not found', code: 'ROUTE_RULE_NOT_FOUND' }, 404)
  }
  return c.json({ success: true, data: version })
})

// POST /api/access-models/:accessModelId/route-rules — 新建草稿版本
routeRulesRoutes.post('/', async (c) => {
  try {
    const body = SaveDraftBody.parse(await c.req.json())
    const created = await saveDraft(requireAccessModelId(c), body.graph, {
      name: body.name,
      description: body.description,
    })
    return c.json({ success: true, data: created }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json(
        { success: false, error: 'invalid request body', code: 'VALIDATION_ERROR' },
        400,
      )
    }
    if (err instanceof AppError) return jsonAppError(c, err)
    throw err
  }
})

// PATCH /api/access-models/:accessModelId/route-rules/:id/activate — 激活版本
routeRulesRoutes.patch('/:id/activate', async (c) => {
  try {
    const activated = await activateVersion(c.req.param('id'))
    return c.json({ success: true, data: activated })
  } catch (err) {
    if (err instanceof AppError) return jsonAppError(c, err)
    throw err
  }
})

// DELETE /api/access-models/:accessModelId/route-rules/:id — 删除版本
routeRulesRoutes.delete('/:id', async (c) => {
  try {
    await deleteVersion(c.req.param('id'))
    return c.json({ success: true })
  } catch (err) {
    if (err instanceof AppError) return jsonAppError(c, err)
    throw err
  }
})

// POST /api/access-models/:accessModelId/route-rules/rebuild — 仅重新编译当前接入模型的索引
//
// 用途：源码热更新（HMR 替换了 module 但 engine 实例还在跑，cache 还是旧的）后
// 让运维一键刷新；或者 schema 迁移/分类器 UUID 解析逻辑变了之后强制重建。
// 返回值摘录编译后的 intentConfig，让运维确认 targetActions 等新字段已注入。
routeRulesRoutes.post('/rebuild', async (c) => {
  const accessModelId = requireAccessModelId(c)
  const engine = getRouteRuleEngine()
  const before = engine.getMatchersForAccessModel(accessModelId).length
  await engine.rebuildOne(accessModelId)
  const after = engine.getMatchersForAccessModel(accessModelId)
  return c.json({
    success: true,
    data: {
      accessModelId,
      before,
      after: after.length,
      intentConfigs: after
        .map((m) => m.action)
        .filter(isIntentAction)
        .map((a) => a.intentConfig ?? null),
    },
  })
})

export default routeRulesRoutes
