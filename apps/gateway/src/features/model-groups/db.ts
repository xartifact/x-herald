/**
 * 模型组 (Model Group)
 *
 * 模型组是对相同能力模型的抽象,可以包含来自不同供应商的相同模型。
 * 例如:"gpt-4" 模型组可以包含 OpenAI 的 gpt-4、Azure 的 gpt-4、Groq 的 gpt-4 等
 *
 * NOTE: Table definitions (modelGroups, modelInstances, etc.) moved to packages/db/src/schema/model-groups.ts
 */

// 模型能力配置
export interface ModelCapabilities {
  // 基本能力
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  jsonMode: boolean;

  // 参数限制
  maxTokens: number;
  contextWindow: number;

  // 特殊能力
  reasoning?: boolean;
  codeInterpreter?: boolean;
  webSearch?: boolean;

  // 其他自定义能力
  [key: string]: unknown;
}


export interface RoutingConfig {
  strategy: 'round_robin' | 'weighted' | 'least_response_time' | 'priority' | 'cost_optimized' | 'smart';
  fallbackEnabled: boolean;
}

export type { ModelGroup, NewModelGroup } from '@x-llm-gateway/db';

/**
 * 模型实例 (Model Instance)
 *
 * 模型实例是模型组在特定供应商上的具体实现。
 * 例如:模型组 "gpt-4" 可以有一个实例指向 OpenAI 的 "gpt-4-turbo"
 */

// 实例特定的配置
export interface InstanceConfig {
  // 该实例特有的参数映射
  // 例如: { temperature: { min: 0, max: 2, default: 1 } }
  parameterMapping?: Record<string, {
    min?: number;
    max?: number;
    default?: unknown;
    transform?: string; // 转换函数表达式
  }>;

  // 覆盖模型组的能力配置
  capabilityOverrides?: Partial<{
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    maxTokens: number;
    contextWindow: number;
  }>;

  // 自定义头
  customHeaders?: Record<string, string>;

  // 是否支持 thinking/extended thinking（Claude 3.7+/4+）
  supportsThinking?: boolean;

  // 当目标模型 thinking 模式开启时，自动为缺少 reasoning_content 的
  // assistant 消息注入空值（兼容 Kimi 等要求 reasoning_content 必须存在的模型）
  patchMissingReasoningContent?: boolean;

  // 重试配置
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;
    retryableStatusCodes: number[];
  };

  // 超时配置
  timeoutConfig?: {
    connectTimeout: number;
    readTimeout: number;
  };

  // 供应商特定参数转换规则
  parameterTransforms?: Array<{
    // 匹配条件
    when?: {
      paramName: string;
      operator: 'eq' | 'ne' | 'exists' | 'not_exists';
      value?: unknown;
    };
    // 转换操作
    action: {
      type: 'add' | 'remove' | 'rename' | 'transform';
      targetParam: string;
      value?: unknown;
      // 简单表达式支持，如: "${reasoning.enabled} ? true : false"
      expression?: string;
    };
  }>;

  // Schema处理配置
  schemaConfig?: {
    cleanEnabled: boolean;
    preserveFields?: string[];  // 保留的字段（覆盖默认清理）
    additionalBannedFields?: string[];  // 额外清理的字段
  };

  // 请求增强：注入到请求体的字段
  requestInject?: Record<string, unknown>;

  // 请求增强：请求体变换表达式
  requestTransform?: string;

  // 响应增强：从响应提取字段到标准位置
  responseExtract?: Record<string, string>;

  // 响应增强：响应体变换表达式
  responseTransform?: string;
}

export type { ModelInstance, NewModelInstance } from '@x-llm-gateway/db';

export type { ModelGroupMembership, NewModelGroupMembership } from '@x-llm-gateway/db';

export type { AccessModel, NewAccessModel } from '@x-llm-gateway/db';

/**
 * 路由规则 (Model Route)
 *
 * 定义请求如何通过条件匹配路由到目标。
 * 支持 React Flow 可视化编辑。
 */

// 路由条件
export interface RouteCondition {
  field: string;
  operator: 'eq' | 'ne' | 'in' | 'starts_with' | 'exists' | 'gt' | 'lt' | 'gte' | 'lte';
  value?: unknown;
}

// 路由动作
export interface RouteAction {
  type: 'route_to_virtual_model' | 'route_to_group' | 'route_to_instance' | 'reject' | 'fallback';
  targetId?: string;
  reason?: string;
}

// React Flow 序列化数据
export interface FlowData {
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
}

export type { ModelRoute, NewModelRoute } from '@x-llm-gateway/db';
