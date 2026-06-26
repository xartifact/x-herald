export type FailoverReason = 'http_429' | 'http_5xx' | 'ttfb_timeout' | 'network_error';

/**
 * 日志元数据结构
 * 用于存储灵活的业务标记和自定义元数据
 */
export interface LogMetadata {
  // 消息序列信息
  messageSequence?: {
    totalCount: number;  // 消息总数
    roles: Array<{
      role: 'user' | 'assistant' | 'system' | 'tool';
      index: number;              // 在消息数组中的位置（从1开始）
      contentType?: string[];     // ['text', 'image']
      toolCallCount?: number;     // assistant 消息包含的工具调用数
      toolName?: string;          // tool 消息关联的工具名称
      toolCallId?: string;        // tool 消息关联的调用 ID
      length?: number;            // 内容长度（字符数）
    }>;
  };

  // 工具调用追踪（增强）
  toolCalls?: {
    pattern?: 'sequential' | 'parallel' | 'single';  // 调用模式
    tools?: string[];                                 // 工具名称列表
    details?: Array<{                                 // 详细信息
      name: string;
      arguments?: unknown;
      result?: unknown;          // 工具执行结果（从 tool role 消息提取）
      callId?: string;           // 调用 ID（如 call_abc123）
      source?: 'request' | 'response';  // 来源
      messageIndex?: number;     // 在消息序列中的位置
    }>;
  };

  // 对话上下文（增强）
  conversation?: {
    messageId?: string;
    parentMessageId?: string;
    turnNumber?: number;
    role?: string;
    roleSwitches?: number;           // 角色切换次数
    hasToolInteraction?: boolean;    // 是否包含工具交互
  };

  // 模型映射信息
  modelMapping?: {
    originalModel?: string;
    mappingType?: 'virtual' | 'exact' | 'alias' | 'fallback' | null;
    isMapped?: boolean;
  };

  // 内容特征
  content?: {
    types?: string[];                                 // text, image, audio, video
    hasFunctionCalling?: boolean;
    responseFormat?: string;
    language?: string;
    toolNames?: string[];                             // 工具调用名称列表
  };

  // 性能和成本
  performance?: {
    cacheHit?: boolean;
    estimatedCostUsd?: number;
    responseTimeTier?: 'fast' | 'normal' | 'slow';
    ttfbMs?: number;                                  // Time to first byte
    usageEstimated?: boolean;                         // 标记 token 是否为估算
    // 链路分段响应时间（毫秒）
    gatewayOverheadMs?: number;                       // 网关预处理耗时（协议检测、路由、转换）
    providerTtfbMs?: number;                          // Provider 首字节响应时间（网络 + Provider 思考）
    streamDurationMs?: number;                        // 流式传输持续时间
    ttfbToFirstThinkingMs?: number;                   // HTTP TTFB → 第一个 thinking token
    ttfbToFirstTextMs?: number;                       // HTTP TTFB → 第一个 text token（TTFT）
    thinkingDurationMs?: number;                      // 实际思考时长（首 thinking → 首 text token）
  };

  // 请求特征
  request?: {
    type?: string;
    useCase?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    thinkingMode?: boolean;           // 是否开启思考模式
  };

  // 路由追踪
  routing?: {
    requestedModel: string;        // 客户端原始请求的模型名
    matchedRuleId?: string;        // 命中的路由规则 ID
    matchedRuleName?: string;      // 命中的路由规则名称
    matchedRulePriority?: number;  // 命中规则的优先级
    modelGroupId?: string;         // 路由到的模型组 ID
    modelGroupName?: string;       // 模型组名称
    instanceId?: string;           // 选中的实例 ID
    actualModelName?: string;      // 实际发送给 Provider 的模型名
    strategy?: string;             // 决策策略
    responseModelName?: string;    // Provider 响应中的实际模型名
  };

  // 错误和重试
  error?: {
    retryCount?: number;
    retryReason?: string;
    category?: string;
    recoverable?: boolean;
  };

  // 业务标记
  business?: {
    userId?: string;
    organizationId?: string;
    tags?: string[];
    customFields?: Record<string, unknown>;
  };
}

/**
 * 流进度信息
 */
export interface StreamProgress {
  chunksProcessed: number;
  bytesReceived: number;
  lastChunkAt: number;
}

/**
 * 流内容信息
 */
export interface StreamContent {
  thinkingBlocks: string[];
  contentChunks: string[];
  allChunks: unknown[];
}

// Table definitions (requestLogs, requestAttempts, etc.) moved to packages/db/src/schema/logs.ts
export type { RequestLog, NewRequestLog, RequestAttempt, NewRequestAttempt, ClientRequestedModel, NewClientRequestedModel, ModelRequestStat, NewModelRequestStat } from '@x-llm-gateway/db';
