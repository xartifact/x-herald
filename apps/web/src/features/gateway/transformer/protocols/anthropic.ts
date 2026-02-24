/**
 * Anthropic 协议转换器
 * 处理 Anthropic 格式与标准格式之间的转换
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
  ToolResult,
  MessageContent,
  StreamChunk,
} from '@/types';

import { cleanSchemaForOpenAI } from '../utils/schema-cleaner';
import { parseToolArguments } from '../utils/tool-arguments-parser';
import { buildHeaders } from '../utils/parameter-transformer';

// Anthropic 特定类型
interface AnthropicMessage {
  role: 'user' | 'assistant' | 'tool';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string } }
        | { type: 'thinking'; thinking: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        | { type: 'tool_result'; tool_use_id: string; content: string }
      >;
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  // system 支持字符串或数组格式
  system?:
    | string
    | Array<{
        type: 'text';
        text: string;
        cache_control?: { type: 'ephemeral' };
      }>;
  tools?: AnthropicTool[];
  tool_choice?: { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string };
  stop_sequences?: string[];
  metadata?: {
    user_id?: string;
  };
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
  // 输出配置 (Anthropic 的 structured output)
  output_config?: {
    type: 'text' | 'json_object' | 'json_schema';
    schema?: unknown;
  };
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'thinking';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  thinking?: string;
  signature?: string;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

interface AnthropicStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  message?: AnthropicResponse;
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    signature?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * 清理文本内容中的控制标签
 * 移除 Claude Code CLI 相关的 XML/HTML 控制标签
 *
 * 已知需要过滤的标签：
 * - <is_displaying_contents>
 * - <filepaths>
 * - 其他潜在的控制标签
 */
function sanitizeStreamContent(text: string): string {
  if (!text) return text;

  // 移除已知的控制标签及其内容
  const controlTagPatterns = [
    /<is_displaying_contents>[\s\S]*?<\/is_displaying_contents>/gi,
    /<filepaths>[\s\S]*?<\/filepaths>/gi,
    // 可扩展：其他控制标签
  ];

  let cleaned = text;
  for (const pattern of controlTagPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 清理多余的空白行（可选，保持格式整洁）
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

export class AnthropicTransformer implements Transformer {
  readonly name = 'anthropic';
  readonly supportedProtocols: ('openai' | 'anthropic' | 'gemini' | 'vertex' | 'custom')[] = ['anthropic'];

  /**
   * 将 Anthropic 请求转换为标准格式
   */
  async normalizeRequest(request: unknown, ctx: TransformerContext): Promise<StandardRequest> {
    const anthropicReq = request as AnthropicRequest;

    // 转换消息
    const standardMessages: StandardMessage[] = anthropicReq.messages.map((msg) =>
      this.convertMessage(msg),
    );

    // 处理 system 字段（支持字符串或数组格式）
    let systemContent: string | { type: 'text'; text: string }[] | undefined;
    if (anthropicReq.system) {
      if (typeof anthropicReq.system === 'string') {
        systemContent = anthropicReq.system;
      } else if (Array.isArray(anthropicReq.system)) {
        // 将 Anthropic 的 system 数组转换为标准格式
        systemContent = anthropicReq.system
          .filter((s) => s.type === 'text')
          .map((s) => ({ type: 'text' as const, text: s.text }));
      }
    }

    return {
      model: anthropicReq.model,
      messages: standardMessages,
      temperature: anthropicReq.temperature,
      max_tokens: anthropicReq.max_tokens,
      top_p: anthropicReq.top_p,
      top_k: anthropicReq.top_k,
      stream: anthropicReq.stream,
      tools: anthropicReq.tools?.map((t) => this.convertTool(t)),
      tool_choice: this.convertToolChoice(anthropicReq.tool_choice),
      stop: anthropicReq.stop_sequences,
      // system 字段（支持字符串或数组格式）
      system: systemContent,
      // output_config 字段
      output_config: anthropicReq.output_config,
      reasoning: anthropicReq.thinking
        ? {
            enabled: true,
            max_tokens: anthropicReq.thinking.budget_tokens,
          }
        : undefined,
      metadata: {
        originalProvider: 'anthropic',
        userId: anthropicReq.metadata?.user_id,
        ...ctx.metadata,
      },
    };
  }

  /**
   * 将标准请求转换为 Anthropic 格式
   */
  async adaptRequest(
    request: StandardRequest,
    ctx: TransformerContext,
  ): Promise<{ body: unknown; url?: string; headers?: Record<string, string> }> {
    // 所有消息都传递给 Anthropic（包括 system，由 Anthropic 内部处理 system 转换）
    const anthropicReq: AnthropicRequest = {
      model: request.model,
      messages: this.convertToAnthropicMessages(request.messages),
      max_tokens: request.max_tokens ?? 4096,
      temperature: request.temperature,
      top_p: request.top_p,
      top_k: request.top_k,
      stream: request.stream,
    };

    // 添加 system prompt（支持字符串或数组格式）
    if (request.system) {
      if (typeof request.system === 'string') {
        anthropicReq.system = request.system;
      } else if (Array.isArray(request.system)) {
        // 转换为 Anthropic 支持的 system 数组格式
        anthropicReq.system = request.system.map((s) => ({
          type: 'text' as const,
          text: s.text,
        }));
      }
    }

    // 添加工具
    if (request.tools?.length) {
      anthropicReq.tools = request.tools.map((t) => this.convertToAnthropicTool(t));
      if (request.tool_choice) {
        anthropicReq.tool_choice = this.convertToAnthropicToolChoice(request.tool_choice);
      }
    }

    // 添加 stop sequences
    if (request.stop) {
      anthropicReq.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop];
    }

    // 添加 reasoning (thinking)
    if (request.reasoning?.enabled) {
      anthropicReq.thinking = {
        type: 'enabled',
        budget_tokens: request.reasoning.max_tokens ?? 1024,
      };
    }

    // 添加 output_config
    if (request.output_config) {
      anthropicReq.output_config = request.output_config;
    }

    // 添加元数据
    if (request.metadata?.userId) {
      anthropicReq.metadata = {
        user_id: request.metadata.userId as string,
      };
    }

    return {
      body: anthropicReq,
      headers: {},
    };
  }

  /**
   * 将 Anthropic 响应转换为标准格式
   */
  async normalizeResponse(response: Response, ctx: TransformerContext): Promise<StandardResponse> {
    const data: AnthropicResponse = await response.json();

    // 提取文本内容、工具调用和思考内容
    let content = '';
    let reasoning_content = '';
    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }> = [];

    for (const block of data.content) {
      if (block.type === 'text' && block.text) {
        const cleanedText = sanitizeStreamContent(block.text);  // ✅ 清理内容
        if (cleanedText) {
          content += cleanedText;
        }
      } else if (block.type === 'thinking' && block.thinking) {
        const cleanedThinking = sanitizeStreamContent(block.thinking);  // ✅ 清理内容
        if (cleanedThinking) {
          reasoning_content += cleanedThinking;
        }
      } else if (block.type === 'tool_use' && block.id) {
        // 使用安全的 JSON 序列化和验证
        const argsString = parseToolArguments(
          JSON.stringify(block.input || {}),
          logger
        );

        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name || '',
            arguments: argsString,
          },
        });
      }
    }

    return {
      id: data.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            reasoning_content: reasoning_content || undefined,
          },
          finish_reason: this.mapFinishReason(data.stop_reason),
        },
      ],
      usage: {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
        prompt_tokens_details: {
          cached_tokens: data.usage.cache_read_input_tokens || 0,
        },
      },
    };
  }

  /**
   * 将标准响应转换为 Anthropic 格式
   */
  async adaptResponse(response: StandardResponse, ctx: TransformerContext): Promise<Response> {
    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error('No choices in response');
    }

    // 构建 Anthropic 内容块
    const content: AnthropicContentBlock[] = [];

    // 添加 thinking 块（如果有 reasoning_content）
    if (choice.message?.reasoning_content) {
      content.push({
        type: 'thinking',
        thinking: choice.message.reasoning_content,
      });
    }

    if (choice.message?.content) {
      const text = typeof choice.message.content === 'string' ? choice.message.content : '';
      if (text) {
        content.push({ type: 'text', text });
      }
    }

    if (choice.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        });
      }
    }

    const anthropicResponse: AnthropicResponse = {
      id: response.id,
      type: 'message',
      role: 'assistant',
      model: response.model,
      content,
      stop_reason: this.mapToAnthropicStopReason(choice.finish_reason),
      stop_sequence: null,
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
      },
    };

    return new Response(JSON.stringify(anthropicResponse), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * 处理 Anthropic 流式响应
   */
  async transformStream(stream: ReadableStream, ctx: TransformerContext): Promise<ReadableStream> {
    const direction = ctx.state.get('streamDirection') as 'normalize' | 'adapt' | undefined;

    if (direction === 'adapt') {
      // 标准格式 → Anthropic SSE
      return this.adaptStreamToAnthropic(stream, ctx);
    } else {
      // Anthropic SSE → 标准格式（normalize）
      return this.normalizeAnthropicStream(stream, ctx);
    }
  }

  /**
   * Anthropic SSE → 标准格式
   */
  private async normalizeAnthropicStream(
    stream: ReadableStream,
    _ctx: TransformerContext,
  ): Promise<ReadableStream> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return new ReadableStream({
      start: async (controller) => {
        const reader = stream.getReader();
        let buffer = '';
        let currentEvent: string | null = null;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmedLine = line.trim();
              
              // 空行表示事件结束
              if (trimmedLine === '') {
                currentEvent = null;
                continue;
              }

              // 解析 event 行
              if (trimmedLine.startsWith('event: ')) {
                currentEvent = trimmedLine.slice(7).trim();
                continue;
              }

              // 解析 data 行
              if (trimmedLine.startsWith('data: ')) {
                const data = trimmedLine.slice(6);
                
                try {
                  const eventData: AnthropicStreamEvent = JSON.parse(data);
                  // 如果有 currentEvent，使用它；否则使用 eventData.type
                  if (currentEvent) {
                    eventData.type = currentEvent as any;
                  }
                  
                  const converted = this.convertStreamEvent(eventData);
                  if (converted) {
                    // 输出标准格式 SSE
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(converted)}\n\n`));
                  }
                } catch (error) {
                  logger.debug({ error, data }, 'Failed to parse Anthropic stream event');
                }
              }
            }
          }

          // 发送 [DONE] 信号
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });
  }

  /**
   * 标准格式 → Anthropic SSE
   */
  private async adaptStreamToAnthropic(
    stream: ReadableStream,
    _ctx: TransformerContext,
  ): Promise<ReadableStream> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return new ReadableStream({
      start: async (controller) => {
        const reader = stream.getReader();
        let buffer = '';
        const messageId = `msg_${crypto.randomUUID()}`;
        let sentMessageStart = false;
        let sentThinkingStart = false;  // 追踪 thinking 块是否已开始
        let sentContentStart = false;
        let thinkingBlockIndex = 0;     // thinking 块的索引
        let textBlockIndex = 1;         // text 块的索引（与 thinking 分开）
        const toolCallsMap = new Map<number, { id?: string; name?: string; arguments: string }>();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                // 发送 message_stop
                const messageStop = { type: 'message_stop' };
                controller.enqueue(encoder.encode(`event: message_stop\n`));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(messageStop)}\n\n`));
                continue;
              }

              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const chunk = JSON.parse(data) as StreamChunk;
                const delta = chunk.choices[0]?.delta;

                // 首次收到 chunk 时发送 message_start
                if (!sentMessageStart) {
                  const messageStart = {
                    type: 'message_start',
                    message: {
                      id: messageId,
                      type: 'message',
                      role: 'assistant',
                      content: [],
                      model: chunk.model || '',
                      usage: { input_tokens: chunk.usage?.prompt_tokens || 0, output_tokens: 0 },
                    },
                  };
                  controller.enqueue(encoder.encode(`event: message_start\n`));
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(messageStart)}\n\n`));
                  sentMessageStart = true;
                }

                // 思考内容（reasoning_content）
                if (delta?.reasoning_content) {
                  // 首次发送 thinking 内容时，先发送 content_block_start
                  if (!sentThinkingStart) {
                    const thinkingBlockStart = {
                      type: 'content_block_start',
                      index: thinkingBlockIndex,
                      content_block: { type: 'thinking', thinking: '' },
                    };
                    controller.enqueue(encoder.encode(`event: content_block_start\n`));
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingBlockStart)}\n\n`));
                    sentThinkingStart = true;
                  }

                  // 发送 thinking 增量
                  const thinkingDelta = {
                    type: 'content_block_delta',
                    index: thinkingBlockIndex,
                    delta: { type: 'thinking', thinking: delta.reasoning_content },
                  };
                  controller.enqueue(encoder.encode(`event: content_block_delta\n`));
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingDelta)}\n\n`));
                }

                // 文本内容
                if (delta?.content) {
                  // 如果之前有 thinking 块且还未关闭，先关闭它
                  if (sentThinkingStart && !sentContentStart) {
                    const thinkingBlockStop = {
                      type: 'content_block_stop',
                      index: thinkingBlockIndex,
                    };
                    controller.enqueue(encoder.encode(`event: content_block_stop\n`));
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingBlockStop)}\n\n`));
                  }

                  if (!sentContentStart) {
                    const contentBlockStart = {
                      type: 'content_block_start',
                      index: textBlockIndex,
                      content_block: { type: 'text', text: '' },
                    };
                    controller.enqueue(encoder.encode(`event: content_block_start\n`));
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify(contentBlockStart)}\n\n`),
                    );
                    sentContentStart = true;
                  }

                  const contentDelta = {
                    type: 'content_block_delta',
                    index: textBlockIndex,
                    delta: { type: 'text_delta', text: delta.content },
                  };
                  controller.enqueue(encoder.encode(`event: content_block_delta\n`));
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentDelta)}\n\n`));
                }

                // 工具调用
                if (delta?.tool_calls) {
                  for (const toolCall of delta.tool_calls) {
                    const originalIndex = toolCall.index || 0;
                    // 工具调用的索引应该从 2 开始（0=thinking, 1=text）
                    const toolIndex = originalIndex + 2;
                    let existingCall = toolCallsMap.get(originalIndex);

                    if (!existingCall) {
                      existingCall = { arguments: '' };
                      toolCallsMap.set(originalIndex, existingCall);
                    }

                    // 工具调用开始
                    if (toolCall.id) {
                      existingCall.id = toolCall.id;
                      existingCall.name = toolCall.function?.name || '';

                      const toolStart = {
                        type: 'content_block_start',
                        index: toolIndex,
                        content_block: {
                          type: 'tool_use',
                          id: toolCall.id,
                          name: existingCall.name,
                        },
                      };
                      controller.enqueue(encoder.encode(`event: content_block_start\n`));
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolStart)}\n\n`));
                    }

                    // 工具参数增量
                    if (toolCall.function?.arguments) {
                      existingCall.arguments += toolCall.function.arguments;

                      const toolDelta = {
                        type: 'content_block_delta',
                        index: toolIndex,
                        delta: {
                          type: 'input_json_delta',
                          partial_json: toolCall.function.arguments,
                        },
                      };
                      controller.enqueue(encoder.encode(`event: content_block_delta\n`));
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolDelta)}\n\n`));
                    }
                  }
                }

                // finish_reason
                if (chunk.choices[0]?.finish_reason) {
                  // 关闭所有打开的内容块
                  const blocksToClose: number[] = [];

                  if (sentThinkingStart) {
                    blocksToClose.push(thinkingBlockIndex);
                  }
                  if (sentContentStart) {
                    blocksToClose.push(textBlockIndex);
                  }

                  // 添加工具调用块
                  toolCallsMap.forEach((_, originalIndex) => {
                    blocksToClose.push(originalIndex + 2);  // 工具调用从索引 2 开始
                  });

                  // 发送所有 content_block_stop 事件
                  for (const index of blocksToClose) {
                    const contentBlockStop = {
                      type: 'content_block_stop',
                      index,
                    };
                    controller.enqueue(encoder.encode(`event: content_block_stop\n`));
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify(contentBlockStop)}\n\n`),
                    );
                  }

                  const messageDelta = {
                    type: 'message_delta',
                    delta: {
                      stop_reason: this.mapToAnthropicStopReason(chunk.choices[0].finish_reason),
                    },
                    usage: {
                      output_tokens: chunk.usage?.completion_tokens || 0,
                    },
                  };
                  controller.enqueue(encoder.encode(`event: message_delta\n`));
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(messageDelta)}\n\n`));
                }
              } catch (error) {
                logger.error({ error, data }, 'Failed to parse standard stream chunk');
              }
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });
  }

  // ==================== 私有辅助方法 ====================

  private convertMessage(msg: AnthropicMessage): StandardMessage {
    const content = this.convertAnthropicContent(msg.content);

    // 提取 tool_calls、tool_call_id 和 thinking 内容
    let toolCalls: ToolCall[] | undefined;
    let toolCallId: string | undefined;
    const toolResults: ToolResult[] = [];
    let reasoning_content = '';

    if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        // 提取 thinking 块
        if (item.type === 'thinking' && 'thinking' in item) {
          reasoning_content = item.thinking || '';
        }

        if (item.type === 'tool_use') {
          if (!toolCalls) toolCalls = [];

          // 使用安全的 JSON 序列化和验证
          const argsString = parseToolArguments(
            JSON.stringify(item.input || {}),
            logger
          );

          toolCalls.push({
            id: item.id || '',
            type: 'function' as const,
            function: {
              name: item.name || '',
              arguments: argsString,
            },
          });
        } else if (item.type === 'tool_result') {
          // 收集所有 tool_result（支持多个）
          toolResults.push({
            tool_call_id: item.tool_use_id,
            content: typeof item.content === 'string' ? item.content : '',
          });
          // 保留最后一个作为 tool_call_id（向后兼容）
          toolCallId = item.tool_use_id;
        }
      }
    }

    // 确定 role：Anthropic 的 tool_result 使用 user 角色，但在标准格式中应为 tool 角色
    let role: 'user' | 'assistant' | 'system' | 'tool' = msg.role;
    const anthropicOriginalRole = msg.role;
    if ((toolCallId || toolResults.length > 0) && !toolCalls) {
      // 这是一个 tool_result 消息，在标准格式中应使用 tool 角色
      role = 'tool';
    }

    return {
      role,
      content,
      tool_calls: toolCalls,
      tool_call_id: toolCallId,
      tool_results: toolResults.length > 0 ? toolResults : undefined,
      reasoning_content: reasoning_content || undefined,
      // 在 metadata 中保留 Anthropic 原始信息
      metadata: {
        anthropicOriginalRole,
        hasToolResult: !!toolCallId || toolResults.length > 0,
        hasToolUse: !!toolCalls?.length,
      },
    };
  }

  private convertAnthropicContent(
    content: AnthropicMessage['content'],
  ): string | MessageContent[] {
    if (typeof content === 'string') return content;

    return content
      .filter((item) => item.type === 'text' || item.type === 'image')
      .map((item) => {
        if (item.type === 'text') {
          return { type: 'text', text: item.text };
        } else {
          // image
          if ('source' in item) {
            if (item.source.type === 'base64') {
              return {
                type: 'image_url',
                image_url: {
                  url: `data:${item.source.media_type};base64,${item.source.data}`,
                },
              };
            } else {
              return {
                type: 'image_url',
                image_url: { url: item.source.url },
              };
            }
          }
          return { type: 'text', text: '' };
        }
      });
  }

  private convertTool(tool: AnthropicTool): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        // 清理 Schema 元数据字段
        parameters: cleanSchemaForOpenAI(tool.input_schema) as ToolDefinition['function']['parameters'],
      },
    };
  }

  private convertToolChoice(
    choice?: AnthropicRequest['tool_choice'],
  ): StandardRequest['tool_choice'] {
    if (!choice) return undefined;
    if (choice.type === 'auto') return 'auto';
    if (choice.type === 'any') return 'required';
    if (choice.type === 'tool') {
      return {
        type: 'function',
        function: { name: choice.name },
      };
    }
    return undefined;
  }

  private convertToAnthropicMessages(messages: StandardMessage[]): AnthropicMessage[] {
    return messages.map((msg) => {
      const content: AnthropicMessage['content'] = this.convertToAnthropicContent(msg);

      // 处理 reasoning_content（必须在 tool_calls 之前）
      if (msg.reasoning_content && Array.isArray(content)) {
        content.unshift({
          type: 'thinking',
          thinking: msg.reasoning_content,
        });
      }

      // 处理 tool_calls
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (Array.isArray(content)) {
            let parsedInput = {};
            try {
              const argumentsStr = tc.function.arguments || '{}';
              // 先验证 JSON 格式
              const validatedArgs = parseToolArguments(argumentsStr, logger);
              parsedInput = JSON.parse(validatedArgs);
            } catch (error) {
              logger.warn({ error, toolCall: tc }, 'Failed to parse tool arguments');
              parsedInput = { text: tc.function.arguments || '' };
            }

            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: parsedInput,
            });
          }
        }
      }

      // 处理 tool_results（支持多个）
      if (msg.tool_results && msg.tool_results.length > 0) {
        for (const tr of msg.tool_results) {
          if (Array.isArray(content)) {
            content.push({
              type: 'tool_result',
              tool_use_id: tr.tool_call_id,
              content: tr.content,
            });
          }
        }
      } else if (msg.tool_call_id) {
        // 向后兼容：处理单个 tool_call_id
        if (Array.isArray(content)) {
          content.push({
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: typeof msg.content === 'string' ? msg.content : '',
          });
        }
      }

      // 处理 role 转换：Anthropic 不支持 'system' 和 'tool' 角色
      // system 消息通过顶层 system 字段处理
      // tool 消息在 Anthropic 中是 user 角色的 tool_result
      const role: 'user' | 'assistant' = msg.role === 'assistant' ? 'assistant' : 'user';

      return {
        role,
        content,
      };
    });
  }

  private convertToAnthropicContent(msg: StandardMessage): AnthropicMessage['content'] {
    if (typeof msg.content === 'string') return msg.content;

    return msg.content.map((item) => {
      if (item.type === 'text') {
        return { type: 'text', text: item.text };
      } else {
        const url = item.image_url.url;
        if (url.startsWith('data:')) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: match[1],
                data: match[2],
              },
            };
          }
        }
        return {
          type: 'image',
          source: { type: 'url', url },
        };
      }
    });
  }

  private convertToAnthropicTool(tool: ToolDefinition): AnthropicTool {
    // 清理 Schema（保持一致性）
    const cleanedParams = tool.function.parameters
      ? cleanSchemaForOpenAI(tool.function.parameters)
      : { type: 'object' };

    return {
      name: tool.function.name,
      description: tool.function.description || '',
      input_schema: cleanedParams as AnthropicTool['input_schema'],
    };
  }

  private convertToAnthropicToolChoice(
    choice: NonNullable<StandardRequest['tool_choice']>,
  ): AnthropicRequest['tool_choice'] {
    if (choice === 'auto') return { type: 'auto' };
    if (choice === 'none') return { type: 'auto' }; // Anthropic 没有 none
    if (choice === 'required') return { type: 'any' };
    if (typeof choice === 'object' && choice.type === 'function') {
      return { type: 'tool', name: choice.function.name };
    }
    return { type: 'auto' };
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' | null {
    if (!reason) return null;
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      case 'stop_sequence':
        return 'stop';
      default:
        return null;
    }
  }



  private mapToAnthropicStopReason(
    reason: string | null,
  ): AnthropicResponse['stop_reason'] {
    if (!reason) return null;
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      case 'tool_calls':
        return 'tool_use';
      case 'content_filter':
        return 'stop_sequence';
      default:
        return null;
    }
  }

  private convertStreamEvent(event: AnthropicStreamEvent): StreamChunk | null {
    switch (event.type) {
      case 'message_start':
        return {
          id: event.message?.id || '',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: event.message?.model || '',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant' },
              finish_reason: null,
            },
          ],
          usage: event.message?.usage
            ? {
                prompt_tokens: event.message.usage.input_tokens,
                completion_tokens: 0,
                total_tokens: event.message.usage.input_tokens,
              }
            : undefined,
        };

      case 'content_block_start':
        // 工具调用开始
        if (event.content_block?.type === 'tool_use') {
          return {
            id: '',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: '',
            choices: [
              {
                index: event.index || 0,
                delta: {
                  tool_calls: [
                    {
                      index: event.index || 0,
                      id: event.content_block.id,
                      type: 'function',
                      function: {
                        name: event.content_block.name || '',
                        arguments: '',
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          };
        }
        // 文本内容开始 - 不输出事件
        return null;

      case 'content_block_delta':
        // 文本增量
        if (event.delta?.type === 'text_delta') {
          const cleanedText = event.delta.text ? sanitizeStreamContent(event.delta.text) : '';  // ✅ 清理内容

          // 如果清理后为空，跳过这个事件
          if (!cleanedText) {
            return null;
          }

          return {
            id: '',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: '',
            choices: [
              {
                index: event.index || 0,
                delta: { content: cleanedText },  // ✅ 使用清理后的内容
                finish_reason: null,
              },
            ],
          };
        }
        // 思考内容增量
        if (event.delta?.type === 'thinking') {
          const cleanedThinking = event.delta.thinking ? sanitizeStreamContent(event.delta.thinking) : '';  // ✅ 清理内容

          // 如果清理后为空，跳过这个事件
          if (!cleanedThinking) {
            return null;
          }

          return {
            id: '',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: '',
            choices: [
              {
                index: event.index || 0,
                delta: { reasoning_content: cleanedThinking },  // ✅ 使用清理后的内容
                finish_reason: null,
              },
            ],
          };
        }
        // 工具调用参数增量
        if (event.delta?.type === 'input_json_delta') {
          return {
            id: '',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: '',
            choices: [
              {
                index: event.index || 0,
                delta: {
                  tool_calls: [
                    {
                      index: event.index || 0,
                      function: { arguments: event.delta.partial_json },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          };
        }
        return null;

      case 'message_delta':
        return {
          id: '',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: '',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: this.mapFinishReason(event.delta?.stop_reason ?? null),
            },
          ],
          usage: event.usage
            ? {
                prompt_tokens: 0,
                completion_tokens: event.usage.output_tokens,
                total_tokens: event.usage.output_tokens,
              }
            : undefined,
        };

      case 'content_block_stop':
      case 'message_stop':
        // 这些事件不需要转换，因为它们不携带数据
        return null;

      default:
        logger.warn({ eventType: event.type }, 'Unknown Anthropic stream event');
        return null;
    }
  }
}
