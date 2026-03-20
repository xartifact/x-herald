import type { LogMetadata } from '@/features/logs/db';
import logger from '@/core/lib/logger';

/**
 * 元数据提取参数
 */
export interface MetadataExtractionParams {
  requestBody?: unknown;
  standardRequestBody?: unknown;
  standardResponseBody?: unknown;
  responseBody?: unknown;
  errorMessage?: string;
  errorType?: string;
  statusCode?: number;
  latencyMs: number;
  // 链路分段时间戳
  gatewayOverheadMs?: number;
  providerTtfbMs?: number;
  streamDurationMs?: number;
  conversationId?: string;
  userId?: string;
  organizationId?: string;
  tags?: string[];
}

/**
 * 从请求/响应中提取元数据标记
 */
export function extractMetadata(params: MetadataExtractionParams): LogMetadata {
  const metadata: LogMetadata = {};

  try {
    // 1. 提取消息序列（新增）
    const messageSeq = extractMessageSequence(params.requestBody, params.standardRequestBody);
    if (messageSeq) {
      metadata.messageSequence = messageSeq;
    }

    // 2. 提取工具调用信息（增强：同时从请求和响应提取）
    const toolCallsInfo = extractToolCalls(
      params.standardRequestBody,
      params.standardResponseBody
    );
    if (toolCallsInfo) {
      metadata.toolCalls = toolCallsInfo;
    }

    // 3. 提取对话上下文（增强）
    const conversationInfo = extractConversationContext(params);
    if (conversationInfo) {
      metadata.conversation = conversationInfo;
    }

    // 4. 提取内容特征
    const contentInfo = extractContentTypes(params.requestBody, params.standardRequestBody);
    
    // 合并工具名称到内容特征
    if (contentInfo || toolCallsInfo?.tools) {
      metadata.content = {
        ...contentInfo,
        // 如果有工具调用，将工具名称添加到 content
        toolNames: toolCallsInfo?.tools && toolCallsInfo.tools.length > 0
          ? toolCallsInfo.tools
          : undefined,
      };
    }

    // 5. 提取性能指标
    const performanceInfo = extractPerformanceMetrics(params);
    if (performanceInfo) {
      metadata.performance = performanceInfo;
    }

    // 6. 提取请求特征
    const requestInfo = extractRequestFeatures(params.standardRequestBody);
    if (requestInfo) {
      metadata.request = requestInfo;
    }

    // 7. 提取错误信息
    if (params.errorMessage || params.errorType) {
      const errorInfo = extractErrorInfo(params);
      if (errorInfo) {
        metadata.error = errorInfo;
      }
    }

    // 8. 提取业务标记
    const businessInfo = extractBusinessTags(params);
    if (businessInfo) {
      metadata.business = businessInfo;
    }
  } catch (error) {
    logger.error({ error }, 'Failed to extract metadata');
  }

  return metadata;
}

/**
 * 从请求中提取消息序列信息
 */
function extractMessageSequence(
  requestBody?: unknown,
  standardRequestBody?: unknown
): LogMetadata['messageSequence'] | null {
  const body = (standardRequestBody || requestBody) as any;
  if (!body?.messages || !Array.isArray(body.messages)) {
    return null;
  }

  const messages = body.messages;
  const roles: NonNullable<LogMetadata['messageSequence']>['roles'] = [];

  messages.forEach((msg: any, index: number) => {
    const roleInfo: any = {
      role: msg.role,
      index: index + 1,
    };

    // 检测内容类型（text, image）
    const contentTypes: string[] = [];
    if (typeof msg.content === 'string') {
      contentTypes.push('text');
    } else if (Array.isArray(msg.content)) {
      msg.content.forEach((part: any) => {
        if (part.type && !contentTypes.includes(part.type)) {
          contentTypes.push(part.type);
        }
      });
    }
    if (contentTypes.length > 0) {
      roleInfo.contentType = contentTypes;
    }

    // 计算内容长度
    let length = 0;
    if (typeof msg.content === 'string') {
      length = msg.content.length;
    } else if (Array.isArray(msg.content)) {
      length = msg.content.reduce((sum: number, part: any) => {
        if (part.text) return sum + part.text.length;
        return sum;
      }, 0);
    }
    if (length > 0) {
      roleInfo.length = length;
    }

    // 工具调用信息（assistant 消息）
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      roleInfo.toolCallCount = msg.tool_calls.length;
    }

    // tool 消息的特殊信息
    if (msg.role === 'tool') {
      roleInfo.toolName = msg.name;
      roleInfo.toolCallId = msg.tool_call_id;
    }

    roles.push(roleInfo);
  });

  return {
    totalCount: messages.length,
    roles,
  };
}

/**
 * 从响应中提取工具调用信息
 */
function extractToolCalls(
  standardRequestBody?: unknown,
  standardResponseBody?: unknown
): LogMetadata['toolCalls'] | null {
  const toolCallsFromResponse = extractToolCallsFromResponse(standardResponseBody);
  const toolResultsFromRequest = extractToolResultsFromRequest(standardRequestBody);

  // 合并工具结果到工具调用详情
  if (toolCallsFromResponse && toolResultsFromRequest.length > 0) {
    toolCallsFromResponse.details?.forEach((detail) => {
      const result = toolResultsFromRequest.find(
        (r) => r.callId === detail.callId || r.toolName === detail.name
      );
      if (result) {
        detail.result = result.result;
      }
    });
  }

  return toolCallsFromResponse;
}

/**
 * 从响应中提取工具调用详情
 */
function extractToolCallsFromResponse(standardResponseBody?: unknown): LogMetadata['toolCalls'] | null {
  if (!standardResponseBody || typeof standardResponseBody !== 'object') {
    return null;
  }

  const response = standardResponseBody as any;

  // 检查是否有工具调用
  const choices = response.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const message = choices[0]?.message;
  if (!message?.tool_calls || !Array.isArray(message.tool_calls)) {
    return null;
  }

  const toolCalls = message.tool_calls;
  if (toolCalls.length === 0) {
    return null;
  }

  // 提取工具名称列表
  const tools = toolCalls.map((tc: any) => tc.function?.name).filter(Boolean);

  // 检测调用模式
  const pattern = detectToolCallPattern(toolCalls);

  // 提取详细信息
  const details = toolCalls.map((tc: any, index: number) => ({
    name: tc.function?.name || 'unknown',
    arguments: tc.function?.arguments ? JSON.parse(tc.function.arguments) : undefined,
    callId: tc.id,
    source: 'response' as const,
    messageIndex: index,
  }));

  return {
    pattern,
    tools,
    details,
  };
}

/**
 * 从请求中提取工具结果
 */
function extractToolResultsFromRequest(standardRequestBody?: unknown): Array<{
  toolName?: string;
  callId?: string;
  result: unknown;
}> {
  const body = standardRequestBody as any;
  if (!body?.messages || !Array.isArray(body.messages)) {
    return [];
  }

  return body.messages
    .filter((msg: any) => msg.role === 'tool')
    .map((msg: any) => ({
      toolName: msg.name,
      callId: msg.tool_call_id,
      result: msg.content,
    }));
}

/**
 * 检测工具调用模式
 */
function detectToolCallPattern(toolCalls: any[]): 'sequential' | 'parallel' | 'single' {
  if (toolCalls.length === 1) {
    return 'single';
  }

  // 简单启发式：如果有多个工具调用，假设是并行的
  // 实际的顺序/并行检测需要更复杂的逻辑
  return 'parallel';
}

/**
 * 提取对话上下文
 */
function extractConversationContext(params: MetadataExtractionParams): LogMetadata['conversation'] | null {
  const body = (params.standardRequestBody || params.requestBody) as any;

  let roleSwitches = 0;
  let hasToolInteraction = false;
  let lastRole: string | null = null;

  // 从消息数组中检测角色切换和工具交互
  if (body?.messages && Array.isArray(body.messages)) {
    body.messages.forEach((msg: any) => {
      if (lastRole && msg.role !== lastRole) {
        roleSwitches++;
      }
      lastRole = msg.role;

      if (msg.role === 'tool' || msg.tool_calls) {
        hasToolInteraction = true;
      }
    });
  }

  // 如果有 conversationId 或者检测到对话特征，则返回对话上下文
  if (!params.conversationId && roleSwitches === 0 && !hasToolInteraction) {
    return null;
  }

  return {
    messageId: undefined, // 可以从请求中提取
    parentMessageId: undefined,
    turnNumber: undefined,
    role: 'assistant', // 默认角色
    roleSwitches: roleSwitches > 0 ? roleSwitches : undefined,
    hasToolInteraction: hasToolInteraction || undefined,
  };
}

/**
 * 提取内容类型
 */
function extractContentTypes(requestBody?: unknown, standardRequestBody?: unknown): LogMetadata['content'] | null {
  const body = (standardRequestBody || requestBody) as any;
  if (!body || typeof body !== 'object') {
    return null;
  }

  const types: string[] = [];
  let hasFunctionCalling = false;

  // 检查消息内容类型
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        if (!types.includes('text')) types.push('text');
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && !types.includes('text')) {
            types.push('text');
          } else if (part.type === 'image_url' && !types.includes('image')) {
            types.push('image');
          }
        }
      }
    }
  }

  // 检查是否有函数调用
  if (body.tools || body.functions) {
    hasFunctionCalling = true;
  }

  if (types.length === 0 && !hasFunctionCalling) {
    return null;
  }

  return {
    types: types.length > 0 ? types : undefined,
    hasFunctionCalling: hasFunctionCalling || undefined,
    responseFormat: body.response_format?.type,
  };
}

/**
 * 提取性能指标
 */
function extractPerformanceMetrics(params: MetadataExtractionParams): LogMetadata['performance'] | null {
  const { latencyMs } = params;

  let latencyTier: 'fast' | 'normal' | 'slow';
  if (latencyMs < 1000) {
    latencyTier = 'fast';
  } else if (latencyMs < 5000) {
    latencyTier = 'normal';
  } else {
    latencyTier = 'slow';
  }

  return {
    latencyTier,
    gatewayOverheadMs: params.gatewayOverheadMs,
    providerTtfbMs: params.providerTtfbMs,
    streamDurationMs: params.streamDurationMs,
  };
}

/**
 * 提取请求特征
 */
function extractRequestFeatures(standardRequestBody?: unknown): LogMetadata['request'] | null {
  const body = standardRequestBody as any;
  if (!body || typeof body !== 'object') {
    return null;
  }

  return {
    temperature: body.temperature,
    maxTokens: body.max_tokens,
    topP: body.top_p,
  };
}

/**
 * 提取错误信息
 */
function extractErrorInfo(params: MetadataExtractionParams): LogMetadata['error'] | null {
  if (!params.errorMessage && !params.errorType) {
    return null;
  }

  const category = categorizeError(params.errorType, params.statusCode);
  const recoverable = isRecoverableError(params.errorType, params.statusCode);

  return {
    category,
    recoverable,
  };
}

/**
 * 错误分类
 */
function categorizeError(errorType?: string, statusCode?: number): string {
  if (!errorType && !statusCode) {
    return 'unknown';
  }

  // 根据状态码分类
  if (statusCode === 429) return 'rate_limit';
  if (statusCode === 401 || statusCode === 403) return 'authentication';
  if (statusCode === 400) return 'invalid_request';
  if (statusCode && statusCode >= 500) return 'server_error';

  // 根据错误类型分类
  if (errorType?.includes('timeout')) return 'timeout';
  if (errorType?.includes('network')) return 'network';
  if (errorType?.includes('rate')) return 'rate_limit';

  return 'unknown';
}

/**
 * 判断错误是否可恢复
 */
function isRecoverableError(errorType?: string, statusCode?: number): boolean {
  // 可恢复的错误：速率限制、超时、临时服务器错误
  if (statusCode === 429) return true;
  if (statusCode === 503) return true;
  if (errorType?.includes('timeout')) return true;
  if (errorType?.includes('network')) return true;

  // 不可恢复的错误：认证失败、无效请求
  if (statusCode === 401 || statusCode === 403) return false;
  if (statusCode === 400) return false;

  return false;
}

/**
 * 提取业务标记
 */
function extractBusinessTags(params: MetadataExtractionParams): LogMetadata['business'] | null {
  const { userId, organizationId, tags } = params;

  if (!userId && !organizationId && (!tags || tags.length === 0)) {
    return null;
  }

  return {
    userId,
    organizationId,
    tags,
  };
}
