/**
 * Model Groups Feature Types
 */

import type {
  ModelGroup as DbModelGroup,
  ModelInstance as DbModelInstance,
  ModelCapabilities,
  InstanceConfig,
  RoutingConfig,
} from './db';

// Re-export database types
export type { ModelCapabilities, InstanceConfig, RoutingConfig };

// Extended types for frontend use
export interface ModelGroup extends DbModelGroup {
  // Frontend 可能需要的额外字段
  instances?: ModelInstance[];
}

export interface ModelInstance extends DbModelInstance {
  // Frontend 可能需要的额外字段
  provider?: {
    id: string;
    name: string;
  };
  // 多对多关系（API 注入，DB 查询中不存在）
  groupIds?: string[];
  groupId?: string | null; // compat: 第一个 groupId
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
  aliases?: string[];
  displayName: string;
  description?: string;
  category?: string;
  capabilities?: ModelCapabilities;
  supportedProtocols?: string[];
  routingConfig?: RoutingConfig;
  metadata?: Record<string, unknown>;
}

// Update Model Group Payload
export interface UpdateModelGroupPayload {
  name?: string;
  aliases?: string[];
  displayName?: string;
  description?: string;
  category?: string;
  capabilities?: ModelCapabilities;
  supportedProtocols?: string[];
  routingConfig?: RoutingConfig;
  metadata?: Record<string, unknown>;
}

// Create Model Instance Payload
export interface CreateModelInstancePayload {
  groupIds?: string[];
  groupId?: string | null; // compat
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
