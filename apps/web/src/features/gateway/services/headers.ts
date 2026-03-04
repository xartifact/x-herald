/**
 * 转发给 Provider 时必须过滤的请求头：
 * - 认证类：由 Gateway 替换为 Provider API Key
 * - 长度类：body 经过转换后长度已变化
 * - Hop-by-hop 类：HTTP 规范规定不得跨代理转发
 * - 代理注入类：Hono/反向代理自动添加的内网信息，会干扰 Provider CDN/WAF 路由
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
]);
