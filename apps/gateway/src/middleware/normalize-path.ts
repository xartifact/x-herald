/**
 * 入口路径去重：把客户端多写一层的版本段折叠掉。
 *
 * 为什么需要：客户端的 base URL 口径并不统一。写成 `https://host/api/v1`
 * 再让 SDK 自己拼 `/v1/messages`，请求就落到 `/api/v1/v1/messages` —— 这条路径
 * 不在路由表里，旧行为是落 SPA 兜底返回 `200 text/html`，客户端只看到
 * `Unexpected token '<'`，看不出是 base URL 写错了。
 *
 * 只折叠**连续重复的版本段**（`v1/v1`、`v2.1/v2.1`），不动资源段：
 * 资源段可能合法地重复（`/api/keys/keys` 的第二段可能是某个名字），
 * 折叠它们会把请求静默改写到别的资源上。不同版本号（`/v2/v1`）也不猜，
 * 语义不明，交给上游 404。
 *
 * 改写是幂等的：折叠结果再跑一次不变，因此重新 dispatch 不会递归。
 */

/** API 版本号路径段，如 v1 / v2 / v4 / v2.1 / v1beta */
const VERSION_SEGMENT_RE = /^v\d+(?:\.\d+)*(?:-?(?:alpha|beta))?$/i

export function isVersionSegment(segment: string): boolean {
  return VERSION_SEGMENT_RE.test(segment)
}

/**
 * 折叠连续重复的版本段；没有可折叠内容时原样返回（调用方据此判断是否需要改写）。
 *
 * `/api/v1/v1/messages` → `/api/v1/messages`
 * `/api/v1/v1/v1/models` → `/api/v1/models`
 * `/api/v2/v1/messages`  → 原样
 */
export function collapseDuplicateVersionSegments(pathname: string): string {
  if (!pathname.startsWith('/')) return pathname

  const hasTrailingSlash = pathname.length > 1 && pathname.endsWith('/')
  const segments = pathname.split('/').filter(Boolean)

  const collapsed: string[] = []
  for (const segment of segments) {
    if (collapsed[collapsed.length - 1] === segment && isVersionSegment(segment)) continue
    collapsed.push(segment)
  }

  if (collapsed.length === segments.length) return pathname
  return '/' + collapsed.join('/') + (hasTrailingSlash ? '/' : '')
}

/**
 * 返回折叠过路径的新 Request；无重复版本段或无法安全改写时返回 `null`。
 *
 * 两种情况不改写：
 * - `Upgrade` 请求：Bun 的 `server.upgrade()` 只认握手时的原始 request，
 *   换成新建的 Request 会让 WS 握手失败（已实测：连接直接 error）。
 * - 折叠结果与原路径相同：没有可做的事。
 */
export function withCollapsedPath(request: Request): Request | null {
  if (request.headers.get('upgrade')) return null

  const url = new URL(request.url)
  const collapsed = collapseDuplicateVersionSegments(url.pathname)
  if (collapsed === url.pathname) return null

  url.pathname = collapsed

  // `duplex: 'half'` 是带 body 的 Request 克隆在 fetch 规范里的必需项；
  // Bun 不强制，但显式声明可让同代码在 workerd/Node 下也成立。
  return new Request(url.toString(), request as unknown as RequestInit)
}
