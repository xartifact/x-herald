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
    // 1. 提取工具调用信息
    const toolCallsInfo = extractToolCalls(params.standardResponseBody);
    if (toolCallsInfo) {
      metadata.toolCalls = toolCallsInfo;
    }

    // 2. 提取对话上下文
    const conversationInfo = extractConversationContext(params);
    if (conversationInfo) {
      metadata.conversation = conversationInfo;
    }

    // 3. 提取内容特征
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

    // 4. 提取性能指标
    const performanceInfo = extractPerformanceMetrics(params);
    if (performanceInfo) {
      metadata.performance = performanceInfo;
    }

    // 5. 提取请求特征
    const requestInfo = extractRequestFeatures(params.standardRequestBody);
    if (requestInfo) {
      metadata.request = requestInfo;
    }

    // 6. 提取错误信息
    if (params.errorMessage || params.errorType) {
      const errorInfo = extractErrorInfo(params);
      if (errorInfo) {
        metadata.error = errorInfo;
      }
    }

    // 7. 提取业务标记
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
 * 从响应中提取工具调用信息
 */
function extractToolCalls(standardResponseBody?: unknown): LogMetadata['toolCalls'] | null {
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
  const details = toolCalls.map((tc: any) => ({
    name: tc.function?.name || 'unknown',
    arguments: tc.function?.arguments ? JSON.parse(tc.function.arguments) : undefined,
  }));

  return {
    pattern,
    tools,
    details,
  };
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
  if (!params.conversationId) {
    return null;
  }

  return {
    messageId: undefined, // 可以从请求中提取
    parentMessageId: undefined,
    turnNumber: undefined,
    role: 'assistant', // 默认角色
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
