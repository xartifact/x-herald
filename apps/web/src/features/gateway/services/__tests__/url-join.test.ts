/**
 * URL 拼接函数测试
 * 测试智能 URL 拼接，避免路径重复
 */

// 从 chat-completion-handler.ts 复制函数用于测试
function joinUrl(baseUrl: string, endpoint: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  const endpointParts = cleanEndpoint.split('/').filter(Boolean);

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

  const finalPathParts = [...basePathParts, ...endpointParts.slice(skipCount)];
  const finalPath = '/' + finalPathParts.join('/');

  return `${baseUrlObj.protocol}//${baseUrlObj.host}${finalPath}`;
}

describe('joinUrl', () => {
  it('应该处理重复的 /v1 路径', () => {
    const result = joinUrl('https://code-api.x-aio.com/v1', '/v1/chat/completions');
    expect(result).toBe('https://code-api.x-aio.com/v1/chat/completions');
  });

  it('应该正确拼接不重复的路径', () => {
    const result = joinUrl('https://api.example.com', '/v1/chat/completions');
    expect(result).toBe('https://api.example.com/v1/chat/completions');
  });

  it('应该处理 baseUrl 末尾有斜杠的情况', () => {
    const result = joinUrl('https://api.example.com/', '/v1/messages');
    expect(result).toBe('https://api.example.com/v1/messages');
  });

  it('应该处理 baseUrl 和 endpoint 都有 /v1 的情况', () => {
    const result = joinUrl('https://api.example.com/v1', '/v1/messages');
    expect(result).toBe('https://api.example.com/v1/messages');
  });

  it('应该处理 Anthropic 协议路径', () => {
    const result = joinUrl('https://code-api.x-aio.com/anthropic', '/v1/messages');
    expect(result).toBe('https://code-api.x-aio.com/anthropic/v1/messages');
  });

  it('应该处理多级重复路径', () => {
    const result = joinUrl('https://api.example.com/api/v1', '/api/v1/chat');
    expect(result).toBe('https://api.example.com/api/v1/chat');
  });

  it('应该处理没有路径的 baseUrl', () => {
    const result = joinUrl('https://api.openai.com', '/v1/chat/completions');
    expect(result).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('应该处理非重叠的嵌套路径（不误删路径段）', () => {
    // /v1 不应被去重，因为 base 以 /proxy 结尾，而 endpoint 以 /v1 开头，无后缀重叠
    const result = joinUrl('https://api.example.com/api/v1/proxy', '/v1/chat/completions');
    expect(result).toBe('https://api.example.com/api/v1/proxy/v1/chat/completions');
  });
});
