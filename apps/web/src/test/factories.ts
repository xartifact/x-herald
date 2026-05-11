/**
 * 测试数据工厂函数
 * 
 * 用法：import { createMockLog, createMockProvider } from '@/test/factories'
 * 
 * 规则：
 * - 每个工厂函数接受 Partial<T> overrides 参数
 * - 返回完整的满足类型约束的对象
 * - 不使用 JSON fixture 文件
 * - 添加 .asConst 满足 readonly 约束时使用 satisfies
 */

import type { Log } from '@/hooks/use-logs'

/**
 * 创建模拟日志对象
 */
export function createMockLog(overrides: Partial<Log> = {}): Log {
  return {
    id: 'log-test-001',
    status: 'success',
    statusCode: 200,
    modelName: 'gpt-4o',
    originalModelName: undefined,
    providerName: 'openai',
    providerId: 'provider-openai',
    virtualKeyName: 'test-key',
    virtualKeyId: 'vk-test-001',
    latencyMs: 1500,
    totalTokens: 500,
    inputTokens: 300,
    outputTokens: 200,
    requestMethod: 'POST',
    requestPath: '/v1/chat/completions',
    clientIp: '127.0.0.1',
    userAgent: 'test-agent',
    streaming: true,
    retryCount: 0,
    errorMessage: undefined,
    errorType: undefined,
    conversationId: undefined,
    toolCallsCount: undefined,
    incomingProtocol: undefined,
    targetProtocol: undefined,
    createdAt: '2025-01-15T10:30:00.000Z',
    metadata: {},
    ...overrides,
  } as Log
}

/**
 * 创建模拟 Provider 对象
 */
export function createMockProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'provider-test-001',
    name: 'Test Provider',
    type: 'openai',
    baseUrl: 'https://api.example.com',
    apiKey: 'sk-test-key',
    enabled: true,
    priority: 1,
    ...overrides,
  }
}

/**
 * 创建模拟 Virtual Key 对象
 */
export function createMockVirtualKey(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vk-test-001',
    name: 'test-key',
    key: 'sk-test-xxx',
    enabled: true,
    rateLimit: undefined,
    expiresAt: undefined,
    ...overrides,
  }
}

/**
 * 创建模拟 Circuit Breaker 状态
 */
export function createMockCircuitBreakerState(overrides: Record<string, unknown> = {}) {
  return {
    providerId: 'provider-test-001',
    state: 'closed' as const,
    failureCount: 0,
    lastFailureTime: undefined,
    openedAt: undefined,
    ...overrides,
  }
}

/**
 * 创建模拟 Failover 上下文参数
 */
export function createMockFailoverParams(overrides: Record<string, unknown> = {}) {
  return {
    providers: [createMockProvider()],
    maxRetries: 3,
    onRetry: undefined,
    ...overrides,
  }
}

/**
 * 创建模拟 ContentFeatures（日志详情用）
 */
export function createMockContentFeatures(overrides: Record<string, unknown> = {}) {
  return {
    tokens: {
      inputOutputRatio: { input: 60, output: 40 },
      tokensPerSecond: 33.3,
      tokensPerMessage: 50,
    },
    request: {
      messageCount: 2,
      roleDistribution: { user: 1, assistant: 1, system: 0 },
      avgMessageLength: 150,
      systemPromptLength: undefined,
    },
    response: {
      blockCount: 1,
      typeDistribution: { text: 1, toolUse: 0, thinking: 0 },
      totalLength: 200,
    },
    complexity: {
      contextLevel: 'medium' as const,
      contentDensity: 1.5,
    },
    ...overrides,
  }
}
