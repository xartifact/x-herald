import { serveStatic } from 'hono/bun'

import type { Hono } from 'hono'

/**
 * 挂载 SPA 静态资源兜底，但把 API 前缀排除在外。
 *
 * 为什么需要排除：SPA 的页面全在 `/login`、`/admin/*`，不存在 `/api` 或 `/v1`
 * 开头的页面。若把这两个前缀也交给 SPA 兜底，写错 base URL 的 API 请求会拿到
 * `200 text/html` —— 客户端只看到 `Unexpected token '<'`，把「路径写错」
 * 误报成「响应格式坏」。让它们落到统一的 JSON 404 才是可诊断的行为。
 *
 * 抽成独立函数是为了可测：`createEngine` 按 `process.cwd()` 解析 dist 路径，
 * 在测试 cwd 下 SPA 根本不会挂载，守卫逻辑否则无法覆盖。
 */
export function mountSpaFallback(app: Hono, distPath: string): void {
  const serveAsset = serveStatic({ root: distPath })
  const serveIndex = serveStatic({ root: distPath, path: 'index.html' })

  // 两道中间件保持原有顺序语义：先找真实文件，再回落到 index.html（前端路由）。
  for (const handler of [serveAsset, serveIndex]) {
    app.use('/*', async (c, next) => {
      const { path } = c.req
      if (path.startsWith('/api') || path.startsWith('/v1')) return next()
      return handler(c, next)
    })
  }
}
