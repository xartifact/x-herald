/**
 * 转发给 Provider 时必须过滤的请求头：
 * - 认证类：由 Gateway 替换为 Provider API Key
 * - 长度类：body 经过转换后长度已变化
 * - Hop-by-hop 类：HTTP 规范规定不得跨代理转发
 * - 代理注入类：Hono/反向代理自动添加的内网信息，会干扰 Provider CDN/WAF 路由
 * - 客户端框架注入：ai-sdk/opencode 等注入的 headers，会干扰 Provider CDN 亲和性路由
 * - 网关内部追踪：Gateway 内部使用的追踪头，不应泄漏给 Provider
 */
export const PROVIDER_FILTERED_HEADERS = new Set([
  // 认证
  'authorization', 'x-api-key',
  // 长度
  'content-length', 'transfer-encoding',
  // Hop-by-hop (RFC 2616 §13.5.1)
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'upgrade',
  // 代理注入头（Hono / Nginx / 反向代理）
  'host', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-port',
  'x-forwarded-proto', 'x-forwarded-server', 'x-real-ip',
  // 客户端框架注入（ai-sdk / OpenCode 等 SDK）
  // x-session-affinity: CDN 亲和性路由，会干扰 Provider 负载均衡
  'x-session-affinity',
  // x-stainless-*: Vercel AI SDK 品牌标识 headers，泄漏 SDK 版本信息
  'x-stainless-lang', 'x-stainless-package-version',
  'x-stainless-os', 'x-stainless-arch', 'x-stainless-runtime',
  'x-stainless-runtime-version',
  // 网关内部追踪（不应转发给 Provider）
  'x-conversation-id', 'x-request-id',
]);

/**
 * 判断 header 是否应被过滤（前缀匹配 + 精确匹配）
 * 用于处理 x-stainless-* 等可能新增的变体
 */
export function shouldFilterHeader(headerName: string): boolean {
  const lower = headerName.toLowerCase();

  // 精确匹配
  if (PROVIDER_FILTERED_HEADERS.has(lower)) return true;

  // 前缀匹配：x-stainless-* 变体（如 x-stainless-retry-count）
  if (lower.startsWith('x-stainless-')) return true;

  return false;
}
