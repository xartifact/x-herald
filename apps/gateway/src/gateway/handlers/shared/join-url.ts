// API 版本号路径段，如 v1 / v2 / v4 / v2.1 / v1beta
const VERSION_SEGMENT_RE = /^v\d+(?:\.\d+)*(?:-?(?:alpha|beta))?$/i

function isVersionSegment(segment: string): boolean {
  return VERSION_SEGMENT_RE.test(segment)
}

/**
 * 智能拼接 URL，避免路径重复
 * 例如：
 * - baseUrl: "https://api.com/v1", endpoint: "/v1/chat" → "https://api.com/v1/chat"
 * - baseUrl: "https://api.com", endpoint: "/v1/chat" → "https://api.com/v1/chat"
 * - baseUrl 已带自己的版本号段（如 "https://api.com/api/v4"），endpoint 版本号（"/v1/chat"）
 *   与之不同字符串但语义等价，仍应去重、保留 baseUrl 已配置的版本号：
 *   "https://api.com/api/v4" + "/v1/chat" → "https://api.com/api/v4/chat"
 */
export function joinUrl(baseUrl: string, endpoint: string): string {
  // 移除 baseUrl 末尾的斜杠
  const cleanBase = baseUrl.replace(/\/+$/, '')
  // 确保 endpoint 以斜杠开头
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`

  // 提取 endpoint 的路径部分（如 "/v1/chat/completions" → ["v1", "chat", "completions"]）
  const endpointParts = cleanEndpoint.split('/').filter(Boolean)

  // 提取 baseUrl 的路径部分
  const baseUrlObj = new URL(cleanBase)
  const basePath = baseUrlObj.pathname.replace(/\/+$/, '')
  const basePathParts = basePath.split('/').filter(Boolean)

  // 查找 basePathParts 后缀与 endpointParts 前缀的最长重叠
  let skipCount = 0
  for (
    let overlapLen = 1;
    overlapLen <= Math.min(basePathParts.length, endpointParts.length);
    overlapLen++
  ) {
    let match = true
    for (let j = 0; j < overlapLen; j++) {
      const baseIdx = basePathParts.length - overlapLen + j
      if (basePathParts[baseIdx] !== endpointParts[j]) {
        match = false
        break
      }
    }
    if (match) {
      skipCount = overlapLen
    }
  }

  // 版本号段语义重叠：没有精确字符串重叠，但 baseUrl 路径末段与 endpoint 首段
  // 都是版本号格式（如 base 以 /v4 结尾、endpoint 以 /v1 开头）时，二者代表同一个
  // "API 版本前缀"位置，应以 baseUrl 已配置的版本号为准，跳过 endpoint 的版本号段，
  // 否则会拼出 /v4/v1/... 这种不存在的路径。
  if (
    skipCount === 0 &&
    basePathParts.length > 0 &&
    endpointParts.length > 0 &&
    isVersionSegment(basePathParts[basePathParts.length - 1]) &&
    isVersionSegment(endpointParts[0])
  ) {
    skipCount = 1
  }

  // 构建最终路径
  const finalPathParts = [...basePathParts, ...endpointParts.slice(skipCount)]
  const finalPath = '/' + finalPathParts.join('/')

  return `${baseUrlObj.protocol}//${baseUrlObj.host}${finalPath}`
}
