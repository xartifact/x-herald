// Re-export from LLM types
export * from './llm';

// Re-export from Transformer types
export * from './transformer';

// Re-export from Constants
export * from './constants';

// Provider Types
export type ProviderType = 'external' | 'system';

export interface Provider {
  id: string;
  type: ProviderType;
  name: string;
  baseUrl: string | null;
  apiKey: string | null;
  enabled: boolean;
  priority: number;
  weight: number;
  maxRequestsPerMin: number | null;
  timeoutMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// Model Types
export type RoutingStrategy = 'round_robin' | 'weighted' | 'least_response_time' | 'priority' | 'smart';

export interface RoutingConfig {
  strategy: RoutingStrategy;
  fallbackEnabled: boolean;
  params?: Record<string, any>;
}

export interface ProtocolConversion {
  enabled: boolean;
  targetProtocol: 'openai' | 'anthropic' | 'gemini';
  preserveOriginal?: boolean;
}

export interface Model {
  id: string;
  providerId: string;
  name: string;
  displayName: string;
  actualModelName: string;
  routingConfig: RoutingConfig | null;
  protocolConversion: ProtocolConversion | null;
  capabilities: Record<string, any> | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Virtual Key Types
export interface VirtualKey {
  id: string;
  key: string;
  name: string;
  allowedModels: string[];
  rateLimitRpm: number | null;
  rateLimitRpd: number | null;
  tokenLimitDaily: bigint | null;
  enabled: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Request Log Types
export type RequestStatus = 'success' | 'failure';

export interface RequestLog {
  id: string;
  virtualKeyId: string | null;
  modelName: string;
  providerId: string;
  status: RequestStatus;
  responseTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  errorMessage: string | null;
  requestBody: Record<string, any> | null;
  responseBody: Record<string, any> | null;
  createdAt: Date;
}

// Model Route Types
export interface ModelRoute {
  id: string;
  virtualModelId: string;
  physicalModelId: string;
  weight: number;
  priority: number;
  enabled: boolean;
  createdAt: Date;
}

// Health Types
export type HealthStatus = 'healthy' | 'degraded' | 'down';
export type HealthTargetType = 'model' | 'virtual_model';

export interface HealthTarget {
  id: string;
  name: string;
  type: HealthTargetType;
  targetId: string;
  enabled: boolean;
  checkIntervalSeconds: number;
  checkPrompt: string;
  checkConfig: Record<string, any> | null;
  createdAt: Date;
}

export interface HealthRun {
  id: string;
  targetId: string;
  checkedAt: Date;
  status: HealthStatus;
  responseTimeMs: number | null;
  errorType: string | null;
  errorMessage: string | null;
}
