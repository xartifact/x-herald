import type { Context } from 'hono';

/**
 * 检测请求协议类型
 * @param path 请求路径
 * @param body 请求体
 * @param headers 请求头（可选，用于更精确的检测）
 */
export function detectProtocol(
  path: string,
  body: unknown,
  headers?: Headers
): 'openai' | 'anthropic' {
  // 1. 优先检查显式协议头
  if (headers) {
    const protocolHeader = headers.get('x-protocol-type');
    if (protocolHeader === 'anthropic') return 'anthropic';
    if (protocolHeader === 'openai') return 'openai';
  }

  // 2. 根据路径判断
  if (path.includes('/v1/chat/completions')) return 'openai';
  if (path.includes('/v1/messages')) return 'anthropic';

  // 3. 改进的启发式检测
  const req = body as Record<string, unknown>;
  if (req && typeof req === 'object') {
    // Anthropic 特有：system 作为顶层字段
    if (typeof req.system === 'string' && 'max_tokens' in req) {
      return 'anthropic';
    }

    // Anthropic 特有：messages 数组中的 role 只能是 user/assistant/tool
    if (Array.isArray(req.messages)) {
      const messages = req.messages as Array<{ role?: string }>;
      const hasSystem = messages.some((m) => m.role === 'system');
      const hasTool = messages.some((m) => m.role === 'tool' || m.role === 'tool_use');
      const validAnthropicRoles = ['user', 'assistant', 'tool'];
      const allValidRoles = messages.every((m) =>
        m.role ? validAnthropicRoles.includes(m.role) : true
      );

      // 如果没有 system 角色，但有 tool 相关角色，可能是 Anthropic
      if (!hasSystem && hasTool && allValidRoles && 'max_tokens' in req) {
        return 'anthropic';
      }
    }

    // OpenAI 特有字段
    if ('seed' in req || 'max_completion_tokens' in req) {
      return 'openai';
    }

    // Anthropic 特有字段组合
    if ('max_tokens' in req && !('temperature' in req) && !('top_p' in req)) {
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
