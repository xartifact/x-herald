import type { Provider } from '../features/providers/db';
import type { VirtualKey } from '../features/keys/db';
import type { ModelGroup, ModelInstance, ModelRoute, AccessModel } from '../features/model-groups/db';
import type { RequestLog } from '../features/logs/db';
import type { CostRecord } from '../features/costs/db';
import type { CircuitBreakerEvent } from '../features/circuit-breaker/db';
import type { HealthRun } from '../features/health/db';
import type { InstancePerfSnapshot } from '../features/metrics/db';
import type { AnomalyEvent } from '../features/metrics/anomaly-db';

export function createTestProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: crypto.randomUUID(),
    name: 'Test Provider',
    apiKey: 'sk-test-provider',
    protocols: {
      openai: {
        baseUrl: 'https://api.openai.com',
        enabled: true,
      },
    },
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestModelGroup(overrides: Partial<ModelGroup> = {}): ModelGroup {
  return {
    id: crypto.randomUUID(),
    name: 'gpt-4',
    aliases: [],
    displayName: 'GPT-4',
    description: null,
    category: 'chat',
    capabilities: {
      streaming: true,
      functionCalling: true,
      vision: false,
      jsonMode: true,
      maxTokens: 8192,
      contextWindow: 128000,
    },
    supportedProtocols: ['openai'],
    enabled: true,
    routingConfig: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestModelInstance(overrides: Partial<ModelInstance> = {}): ModelInstance {
  return {
    id: crypto.randomUUID(),
    providerId: crypto.randomUUID(),
    name: 'OpenAI GPT-4',
    actualModelName: 'gpt-4-turbo',
    description: null,
    config: null,
    weight: 100,
    priority: 0,
    costPer1kTokens: null,
    healthCheckUrl: null,
    enabled: true,
    status: 'unknown',
    lastCheckedAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestVirtualKey(overrides: Partial<VirtualKey> = {}): VirtualKey {
  return {
    id: crypto.randomUUID(),
    key: 'sk-test-' + crypto.randomUUID().slice(0, 8),
    name: 'Test Key',
    allowedModels: null,
    rateLimitRpm: null,
    rateLimitRpd: null,
    tokenLimitDaily: null,
    enabled: true,
    expiresAt: null,
    lastUsedAt: null,
    totalRequests: 0,
    totalTokens: BigInt(0),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestRequestLog(overrides: Partial<RequestLog> = {}): RequestLog {
  return {
    id: crypto.randomUUID(),
    requestGroupId: crypto.randomUUID(),
    candidateIndex: 0,
    failoverReason: null,
    virtualKeyId: null,
    virtualKeyName: null,
    modelName: 'gpt-4',
    originalModelName: null,
    providerId: null,
    providerName: null,
    status: 'success',
    statusCode: 200,
    responseTimeMs: 1000,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    requestHeaders: null,
    requestBody: null,
    clientResponseHeaders: null,
    responseBody: null,
    errorMessage: null,
    errorType: null,
    clientIp: null,
    userAgent: null,
    clientType: null,
    requestPath: '/v1/chat/completions',
    requestMethod: 'POST',
    streaming: 'false',
    incomingProtocol: 'openai',
    targetProtocol: 'openai',
    metadata: null,
    toolCallsCount: 0,
    retryCount: 0,
    conversationId: null,
    streamStatus: 'completed',
    streamProgress: null,
    streamContent: null,
    streamStartedAt: new Date(),
    streamCompletedAt: new Date(),
    lastUpdatedAt: new Date(),
    isComplete: true,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createTestCostRecord(overrides: Partial<CostRecord> = {}): CostRecord {
  return {
    id: crypto.randomUUID(),
    requestLogId: crypto.randomUUID(),
    keyId: crypto.randomUUID(),
    keyName: 'Test Key',
    modelName: 'gpt-4',
    providerName: 'Test Provider',
    inputTokens: 100,
    outputTokens: 50,
    inputCost: 0.001,
    outputCost: 0.002,
    totalCost: 0.003,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createTestModelRoute(overrides: Partial<ModelRoute> = {}): ModelRoute {
  return {
    id: crypto.randomUUID(),
    name: 'Test Route',
    description: null,
    accessModelIds: [],
    conditions: [],
    action: { type: 'fallback' },
    priority: 0,
    enabled: true,
    flowData: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestAccessModel(overrides: Partial<AccessModel> = {}): AccessModel {
  return {
    id: crypto.randomUUID(),
    name: 'gpt-4',
    displayName: 'GPT-4',
    description: null,
    enabled: true,
    capabilities: {
      streaming: true,
      functionCalling: true,
      vision: false,
      jsonMode: true,
      maxTokens: 8192,
      contextWindow: 128000,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestCircuitBreakerEvent(overrides: Partial<CircuitBreakerEvent> = {}): CircuitBreakerEvent {
  return {
    id: crypto.randomUUID(),
    instanceId: crypto.randomUUID(),
    instanceName: 'Test Instance',
    groupName: 'test-group',
    providerName: 'Test Provider',
    event: 'opened',
    failureCount: 5,
    tripCount: 1,
    openUntil: null,
    cooldownUntil: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createTestHealthRun(overrides: Partial<HealthRun> = {}): HealthRun {
  return {
    id: crypto.randomUUID(),
    targetId: crypto.randomUUID(),
    checkedAt: new Date(),
    status: 'healthy',
    responseTimeMs: 150,
    errorType: null,
    errorMessage: null,
    ...overrides,
  };
}

export function createTestInstancePerfSnapshot(overrides: Partial<InstancePerfSnapshot> = {}): InstancePerfSnapshot {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    instanceId: crypto.randomUUID(),
    instanceName: 'Test Instance',
    groupId: null,
    groupName: null,
    providerId: null,
    providerName: null,
    bucketStart: new Date(now.getTime() - 3600000),
    bucketEnd: now,
    sampleCount: 100,
    successCount: 95,
    errorCount: 5,
    successRate: 0.95,
    ttfbAvg: 120,
    ttfbP50: 100,
    ttfbP95: 250,
    ttfbP99: 400,
    ttfbMin: 50,
    ttfbMax: 500,
    latencyAvg: 300,
    latencyP50: 250,
    latencyP95: 600,
    latencyP99: 900,
    ttftAvg: 80,
    ttftP95: 200,
    tpsAvg: 45,
    tpsP50: 42,
    avgInputTokens: 500,
    avgOutputTokens: 250,
    avgRetryCount: 0,
    createdAt: now,
    ...overrides,
  };
}

export function createTestAnomalyEvent(overrides: Partial<AnomalyEvent> = {}): AnomalyEvent {
  return {
    id: crypto.randomUUID(),
    type: 'slow_request',
    severity: 'warning',
    providerName: 'Test Provider',
    modelName: 'gpt-4',
    instanceId: crypto.randomUUID(),
    description: 'Response time exceeded threshold',
    details: null,
    resolved: false,
    resolvedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}
