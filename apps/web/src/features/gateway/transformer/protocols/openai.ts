/**
 * OpenAI 协议转换器
 * 处理 OpenAI 格式与标准格式之间的转换
 */

import logger from '@/core/lib/logger';
import type {
  Transformer,
  TransformerContext,
  StandardRequest,
  StandardResponse,
  StandardMessage,
  ToolDefinition,
  ToolCall,
  StreamChunk,
  MessageContent,
} from '@/types';

import { applyParameterTransforms, buildHeaders } from '../utils/parameter-transformer';
import { cleanSchemaForOpenAI } from '../utils/schema-cleaner';
import { parseToolArguments } from '../utils/tool-arguments-parser';

// OpenAI 特定类型
interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  reasoning_content?: string; // 阿里云百炼特有
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  stream_options?: {
    include_usage?: boolean;
  };
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  response_format?: {
    type: 'text' | 'json_object' | 'json_schema';
    schema?: unknown;
  };
  stop?: string | string[];
  seed?: number;
}

interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string; // 阿里云百炼特有
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIChoice {
  index: number;
  message?: {
    role: string;
    content?: string;
    reasoning_content?: string; // 阿里云百炼特有
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  finish_reason: string | null;
}


export class OpenAITransformer implements Transformer {
  readonly name = 'openai';
  readonly supportedProtocols: ('openai' | 'anthropic' | 'gemini' | 'vertex' | 'custom')[] = ['openai'];

  /**
   * 将 OpenAI 请求转换为标准格式
   */
  async normalizeRequest(request: unknown, ctx: TransformerContext): Promise<StandardRequest> {
    const openaiReq = request as OpenAIRequest;

    // OpenAI 的 response_format 映射到标准的 output_config
    const outputConfig = openaiReq.response_format
      ? {
          type: openaiReq.response_format.type,
          schema: openaiReq.response_format.schema,
        }
      : undefined;

    return {
      model: openaiReq.model,
      messages: this.convertMessages(openaiReq.messages),
      temperature: openaiReq.temperature,
      max_tokens: openaiReq.max_completion_tokens ?? openaiReq.max_tokens,
      top_p: openaiReq.top_p,
      frequency_penalty: openaiReq.frequency_penalty,
      presence_penalty: openaiReq.presence_penalty,
      stream: openaiReq.stream,
      tools: openaiReq.tools,
      tool_choice: openaiReq.tool_choice,
      stop: openaiReq.stop,
      seed: openaiReq.seed,
      stream_options: openaiReq.stream_options,
      response_format: openaiReq.response_format,
      output_config: outputConfig,
      metadata: {
        originalProvider: 'openai',
        ...ctx.metadata,
      },
    };
  }

  /**
   * 将标准请求转换为 OpenAI 格式
   */
  async adaptRequest(
    request: StandardRequest,
    ctx: TransformerContext,
  ): Promise<{ body: unknown; url?: string; headers?: Record<string, string> }> {
    // 1. 应用实例特定的参数转换
    let transformedRequest = request;
    if (ctx.instanceConfig?.parameterTransforms) {
      transformedRequest = applyParameterTransforms(
        request,
        ctx.instanceConfig.parameterTransforms,
        ctx
      );
    }

    const openaiReq: OpenAIRequest = {
      model: transformedRequest.model,
      messages: this.convertToOpenAIMessages(transformedRequest.messages),
      temperature: transformedRequest.temperature,
      max_tokens: transformedRequest.max_tokens,
      top_p: transformedRequest.top_p,
      frequency_penalty: transformedRequest.frequency_penalty,
      presence_penalty: transformedRequest.presence_penalty,
      stream: transformedRequest.stream,
      stream_options: transformedRequest.stream_options,
      stop: transformedRequest.stop,
      seed: transformedRequest.seed,
    };

    // 添加可选字段
    if (transformedRequest.tools?.length) {
      // 防御性清理：确保 Schema 符合规范（支持配置）
      const schemaConfig = ctx.instanceConfig?.schemaConfig
        ? {
            cleanEnabled: ctx.instanceConfig.schemaConfig.cleanEnabled,
            preserveFields: ctx.instanceConfig.schemaConfig.preserveFields,
            additionalBannedFields: ctx.instanceConfig.schemaConfig.additionalBannedFields,
          }
        : undefined;
      openaiReq.tools = transformedRequest.tools.map(tool => ({
        ...tool,
        function: {
          ...tool.function,
          parameters: tool.function.parameters
            ? cleanSchemaForOpenAI(tool.function.parameters, schemaConfig) as typeof tool.function.parameters
            : tool.function.parameters,
        },
      }));

      if (transformedRequest.tool_choice) {
        openaiReq.tool_choice = transformedRequest.tool_choice;
      }
    }

    if (transformedRequest.response_format) {
      openaiReq.response_format = transformedRequest.response_format;
    }

    // output_config 映射到 response_format
    if (transformedRequest.output_config) {
      openaiReq.response_format = {
        type: transformedRequest.output_config.type,
        schema: transformedRequest.output_config.schema,
      };
    }

    // 应用参数映射（如果存在）
    if (ctx.instanceConfig?.parameterMapping) {
      for (const [param, config] of Object.entries(ctx.instanceConfig.parameterMapping)) {
        if (config.default !== undefined && openaiReq[param as keyof OpenAIRequest] === undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (openaiReq as any)[param] = config.default;
        }
      }
    }

    return {
      body: openaiReq,
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  /**
   * 将 OpenAI 响应转换为标准格式
   */
  async normalizeResponse(response: Response, ctx: TransformerContext): Promise<StandardResponse> {
    // 添加空响应检查
    if (!response.body) {
      logger.error({ requestId: ctx.requestId }, 'Provider returned empty response body');
      throw new Error('Provider returned empty response body');
    }

    // 添加 JSON 解析保护
    let data;
    try {
      data = await response.json();
    } catch {
      const text = await response.text();
      logger.error(
        { requestId: ctx.requestId, statusCode: response.status },
        'Failed to parse provider response as JSON'
      );
      throw new Error(`Invalid JSON response from provider: ${text.slice(0, 100)}`);
    }

    return {
      id: data.id,
      object: data.object || 'chat.completion',
      created: data.created || Math.floor(Date.now() / 1000),
      model: data.model,
      choices: (data.choices as OpenAIChoice[])?.map((choice) => {
        // 提取 reasoning_content（支持所有 OpenAI 兼容提供商）
        let reasoning_content: string | undefined;
        if (choice.message?.reasoning_content) {
          reasoning_content = choice.message.reasoning_content;
        }

        return {
          index: choice.index,
          message: choice.message
            ? {
                role: choice.message.role as StandardMessage['role'],
                content: choice.message.content || '',
                tool_calls: choice.message.tool_calls,
                reasoning_content,
              }
            : undefined,
          finish_reason: this.mapFinishReason(choice.finish_reason),
        };
      }),
      usage: data.usage
        ? {
            prompt_tokens: data.usage.prompt_tokens || 0,
            completion_tokens: data.usage.completion_tokens || 0,
            total_tokens: data.usage.total_tokens || 0,
            prompt_tokens_details: data.usage.prompt_tokens_details,
          }
        : undefined,
    };
  }

  /**
   * 将标准响应转换为 OpenAI 格式
   */
  async adaptResponse(response: StandardResponse, ctx: TransformerContext): Promise<Response> {
    const openaiResponse = {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      choices: response.choices?.map((choice) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const message: any = choice.message
          ? {
              role: choice.message.role,
              content: choice.message.content,
              tool_calls: choice.message.tool_calls,
            }
          : undefined;

        // 添加 reasoning_content（如果存在）
        if (choice.message?.reasoning_content) {
          message.reasoning_content = choice.message.reasoning_content;
        }

        return {
          index: choice.index,
          message,
          finish_reason: choice.finish_reason,
        };
      }),
      usage: response.usage,
    };

    return new Response(JSON.stringify(openaiResponse), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * 处理 OpenAI 流式响应
   */
  async transformStream(stream: ReadableStream, ctx: TransformerContext): Promise<ReadableStream> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return new ReadableStream({
      start: async (controller) => {
        const reader = stream.getReader();
        let buffer = '';
        let errorCount = 0;
        const MAX_ERRORS = 5;
        const errors: Array<{ error: unknown; data: string }> = [];
        let model = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6);
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                continue;
              }

              try {
                const chunk: OpenAIStreamChunk = JSON.parse(data);

                // 记录 model（用于错误报告）
                if (chunk.model && !model) {
                  model = chunk.model;
                }

                // 验证工具调用参数（如果存在）
                if (chunk.choices?.[0]?.finish_reason === 'tool_calls') {
                  chunk.choices.forEach(choice => {
                    if (choice.delta?.tool_calls) {
                      choice.delta.tool_calls.forEach(tc => {
                        if (tc.function?.arguments) {
                          tc.function.arguments = parseToolArguments(
                            tc.function.arguments,
                            logger
                          );
                        }
                      });
                    }
                  });
                }

                const standardChunk = this.convertStreamChunk(chunk);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(standardChunk)}\n\n`));
              } catch (error) {
                errorCount++;
                errors.push({ error, data });

                logger.error(
                  { error, data, errorCount, requestId: ctx.requestId },
                  'Failed to parse stream chunk'
                );

                // 超过阈值，向流中注入错误事件
                if (errorCount >= MAX_ERRORS) {
                  const errorChunk = {
                    id: ctx.requestId,
                    object: 'chat.completion.chunk' as const,
                    created: Math.floor(Date.now() / 1000),
                    model: model || 'unknown',
                    choices: [{
                      index: 0,
                      delta: { content: '\n[Stream Error: Multiple parse failures]' },
                      finish_reason: 'stop' as const
                    }]
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  controller.close();
                  return;
                }
              }
            }
          }
        } catch (error) {
          // 记录完整错误上下文
          logger.error(
            { error, errorCount, errors: errors.slice(-3), requestId: ctx.requestId },
            'Stream transformation failed'
          );
          controller.error(error);
        } finally {
          reader.releaseLock();
          // 只在正常结束时关闭（错误情况已在上面处理）
          if (errorCount < MAX_ERRORS) {
            controller.close();
          }
        }
      },
    });
  }

  // ==================== 私有辅助方法 ====================

  private convertMessages(messages: OpenAIMessage[]): StandardMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: this.convertContent(msg.content),
      tool_calls: msg.tool_calls ? this.normalizeToolCalls(msg.tool_calls) : undefined,
      tool_call_id: msg.tool_call_id,
      name: msg.name,
      // 保留原始消息的所有元数据
      metadata: msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : undefined,
    }));
  }

  /**
   * 规范化 tool_calls，确保 arguments 始终是 JSON 字符串
   * 某些客户端可能发送对象而不是字符串，需要统一处理
   * 使用三层解析策略验证和修复 JSON 格式
   */
  private normalizeToolCalls(toolCalls: OpenAIMessage['tool_calls']): ToolCall[] {
    if (!toolCalls) return [];

    return toolCalls.map((tc) => {
      let argsString: string;

      // 确保 arguments 是字符串
      if (typeof tc.function.arguments === 'string') {
        argsString = tc.function.arguments;
      } else {
        argsString = JSON.stringify(tc.function.arguments);
      }

      // 验证并修复 JSON 格式
      const validatedArgs = parseToolArguments(argsString, logger);

      return {
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: validatedArgs,
        },
      };
    });
  }

  private convertContent(
    content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> | undefined,
  ): string | MessageContent[] {
    if (!content) return '';
    if (typeof content === 'string') return content;

    return content.map((item) => {
      if (item.type === 'text') {
        return { type: 'text', text: item.text };
      } else {
        return {
          type: 'image_url',
          image_url: {
            url: item.image_url.url,
          },
        };
      }
    });
  }

  private convertToOpenAIMessages(messages: StandardMessage[]): OpenAIMessage[] {
    return messages.map((msg) => {
      const openaiMsg: OpenAIMessage = {
        role: msg.role,
      };

      if (typeof msg.content === 'string') {
        openaiMsg.content = msg.content;
      } else if (Array.isArray(msg.content)) {
        openaiMsg.content = msg.content.map((item) => {
          if (item.type === 'text') {
            return { type: 'text', text: item.text };
          } else {
            return {
              type: 'image_url',
              image_url: { url: item.image_url.url },
            };
          }
        });
      }

      if (msg.tool_calls) {
        // 确保 arguments 始终是 JSON 字符串
        openaiMsg.tool_calls = this.normalizeToolCalls(msg.tool_calls);
      }

      if (msg.tool_call_id) {
        openaiMsg.tool_call_id = msg.tool_call_id;
      }

      if (msg.name) {
        openaiMsg.name = msg.name;
      }

      // 还原 metadata 中的字段
      if (msg.metadata?.reasoning_content) {
        openaiMsg.reasoning_content = msg.metadata.reasoning_content as string;
      }

      return openaiMsg;
    });
  }

  private convertStreamChunk(chunk: OpenAIStreamChunk): StreamChunk {
    return {
      id: chunk.id,
      object: 'chat.completion.chunk',
      created: chunk.created,
      model: chunk.model,
      choices: chunk.choices.map((choice) => ({
        index: choice.index,
        delta: {
          role: choice.delta.role as StandardMessage['role'] | undefined,
          content: choice.delta.content,
          reasoning_content: choice.delta.reasoning_content,
          tool_calls: choice.delta.tool_calls?.map((tc) => ({
            index: tc.index,
            id: tc.id,
            type: tc.type,
            function: tc.function,
          })),
        },
        finish_reason: choice.finish_reason,
      })),
      usage: chunk.usage,
    };
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' | null {
    if (!reason) return null;
    if (['stop', 'length', 'tool_calls', 'content_filter'].includes(reason)) {
      return reason as 'stop' | 'length' | 'tool_calls' | 'content_filter';
    }
    return null;
  }

  /**
   * 检测是否为阿里云百炼 Provider
   */
  private isAlibabaDashscope(ctx: TransformerContext): boolean {
    const provider = ctx.provider;
    if (!provider) return false;

    // 通过 baseUrl 判断
    return provider.baseUrl?.includes('dashscope.aliyuncs.com') ?? false;
  }

}
