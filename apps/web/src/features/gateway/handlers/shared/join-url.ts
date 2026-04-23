/**
 * 智能拼接 URL，避免路径重复
 * 例如：
 * - baseUrl: "https://api.com/v1", endpoint: "/v1/chat" → "https://api.com/v1/chat"
 * - baseUrl: "https://api.com", endpoint: "/v1/chat" → "https://api.com/v1/chat"
 */
export function joinUrl(baseUrl: string, endpoint: string): string {
  // 移除 baseUrl 末尾的斜杠
  const cleanBase = baseUrl.replace(/\/+$/, '');
  // 确保 endpoint 以斜杠开头
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // 提取 endpoint 的路径部分（如 "/v1/chat/completions" → ["v1", "chat", "completions"]）
  const endpointParts = cleanEndpoint.split('/').filter(Boolean);

  // 提取 baseUrl 的路径部分
  const baseUrlObj = new URL(cleanBase);
  const basePath = baseUrlObj.pathname.replace(/\/+$/, '');
  const basePathParts = basePath.split('/').filter(Boolean);

  // 查找 basePathParts 后缀与 endpointParts 前缀的最长重叠
  let skipCount = 0;
  for (let overlapLen = 1; overlapLen <= Math.min(basePathParts.length, endpointParts.length); overlapLen++) {
    let match = true;
    for (let j = 0; j < overlapLen; j++) {
      const baseIdx = basePathParts.length - overlapLen + j;
      if (basePathParts[baseIdx] !== endpointParts[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      skipCount = overlapLen;
    }
  }

  // 构建最终路径
  const finalPathParts = [...basePathParts, ...endpointParts.slice(skipCount)];
  const finalPath = '/' + finalPathParts.join('/');

  return `${baseUrlObj.protocol}//${baseUrlObj.host}${finalPath}`;
}
