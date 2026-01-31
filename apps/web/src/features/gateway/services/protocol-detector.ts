import type { Context } from 'hono';

/**
 * 检测请求协议类型
 */
export function detectProtocol(path: string, body: unknown): 'openai' | 'anthropic' {
  // 根据路径判断
  if (path.includes('/chat/completions')) return 'openai';
  if (path.includes('/messages')) return 'anthropic';

  // 根据请求体判断
  const req = body as Record<string, unknown>;
  if (req && typeof req === 'object') {
    // Anthropic 特有字段
    if ('max_tokens' in req && !('max_completion_tokens' in req) && !('seed' in req)) {
      return 'anthropic';
    }
  }

  // 默认 OpenAI
  return 'openai';
}

/**
 * 智能选择最佳协议
 *
 * 优先级：
 * 1. 客户端协议与供应商协议匹配（原生支持，无需转换）
 * 2. 供应商支持的任一协议（需要转换）
 * 3. 默认 OpenAI
 */
export function getProviderProtocol(
  clientProtocol: 'openai' | 'anthropic',
  provider: { protocols?: Record<string, { enabled?: boolean }> }
): 'openai' | 'anthropic' {
  // 1. 优先原生匹配
  if (provider.protocols?.[clientProtocol]?.enabled) {
    return clientProtocol;
  }

  // 2. 次选其他可用协议
  if (clientProtocol === 'anthropic' && provider.protocols?.openai?.enabled) {
    return 'openai';
  }
  if (clientProtocol === 'openai' && provider.protocols?.anthropic?.enabled) {
    return 'anthropic';
  }

  // 3. 兜底默认
  return 'openai';
}

/**
 * 获取 Provider 的 API URL
 */
export function getProviderUrl(
  provider: { protocols?: Record<string, { enabled?: boolean; baseUrl?: string }> },
  protocol: 'openai' | 'anthropic',
): string | null {
  const config = provider.protocols?.[protocol];
  if (!config?.enabled || !config.baseUrl) return null;
  return config.baseUrl;
}

/**
 * 获取协议对应的端点
 */
export function getEndpoint(protocol: string, isStreaming: boolean): string {
  switch (protocol) {
    case 'openai':
      return '/v1/chat/completions';
    case 'anthropic':
      return '/v1/messages';
    default:
      return '/v1/chat/completions';
  }
}
