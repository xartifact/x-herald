/**
 * Model Groups Feature Types
 */

import type {
  ModelGroup as DbModelGroup,
  ModelInstance as DbModelInstance,
  ModelCapabilities,
  ModelGroupRoutingConfig,
  RoutingStrategy,
  InstanceConfig,
} from './db';

// Re-export database types
export type { ModelCapabilities, ModelGroupRoutingConfig, RoutingStrategy, InstanceConfig };

// Extended types for frontend use
export interface ModelGroup extends DbModelGroup {
  // Frontend 可能需要的额外字段
}

export interface ModelInstance extends DbModelInstance {
  // Frontend 可能需要的额外字段
  provider?: {
    id: string;
    name: string;
  };
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// Model Group Detail (包含实例列表)
export interface ModelGroupDetail {
  group: ModelGroup;
  instances: ModelInstance[];
}

// Create Model Group Payload
export interface CreateModelGroupPayload {
  name: string;
  displayName: string;
  description?: string;
  category?: string;
  capabilities?: ModelCapabilities;
  routingConfig?: ModelGroupRoutingConfig;
  supportedProtocols?: string[];
  metadata?: Record<string, unknown>;
}

// Update Model Group Payload
export interface UpdateModelGroupPayload {
  name?: string;
  displayName?: string;
  description?: string;
  category?: string;
  capabilities?: ModelCapabilities;
  routingConfig?: ModelGroupRoutingConfig;
  supportedProtocols?: string[];
  metadata?: Record<string, unknown>;
}

// Create Model Instance Payload
export interface CreateModelInstancePayload {
  groupId: string;
  providerId: string;
  name: string;
  actualModelName: string;
  description?: string;
  weight?: number;
  priority?: number;
  costPer1kTokens?: {
    input: number;
    output: number;
  };
  config?: InstanceConfig;
}

// Update Model Instance Payload
export interface UpdateModelInstancePayload {
  name?: string;
  actualModelName?: string;
  description?: string;
  weight?: number;
  priority?: number;
  costPer1kTokens?: {
    input: number;
    output: number;
  };
  config?: InstanceConfig;
}
