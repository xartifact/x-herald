/**
 * Anthropic 协议转换器
 * 处理 Anthropic 格式与标准格式之间的转换
 */

import type {
  Transformer,
  TransformerContext,
  StandardRequest,
  StandardResponse,
  StandardMessage,
  ToolDefinition,
  MessageContent,
} from '@x-llm-gateway/shared';
import logger from '@/core/lib/logger';

// Anthropic 特定类型
interface AnthropicMessage {
  role: 'user' | 'assistant' | 'tool';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string } }
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
  system?: string;
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

export class AnthropicTransformer implements Transformer {
  readonly name = 'anthropic';
  readonly supportedProtocols: ('openai' | 'anthropic' | 'gemini' | 'vertex' | 'custom')[] = ['anthropic'];

  /**
   * 将 Anthropic 请求转换为标准格式
   */
  async normalizeRequest(request: unknown, ctx: TransformerContext): Promise<StandardRequest> {
    const anthropicReq = request as AnthropicRequest;

    logger.debug(
      { requestId: ctx.requestId, model: anthropicReq.model },
      'Normalizing Anthropic request',
    );

    // 转换消息
    let standardMessages: StandardMessage[] = [];

    // 处理 system 消息
    if (anthropicReq.system) {
      standardMessages.push({
        role: 'system',
        content: anthropicReq.system,
      });
    }

    // 转换普通消息
    standardMessages = standardMessages.concat(
      anthropicReq.messages.map((msg) => this.convertMessage(msg)),
    );

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
    // 分离 system 消息和普通消息
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    const anthropicReq: AnthropicRequest = {
      model: request.model,
      messages: this.convertToAnthropicMessages(otherMessages),
      max_tokens: request.max_tokens ?? 4096,
      temperature: request.temperature,
      top_p: request.top_p,
      top_k: request.top_k,
      stream: request.stream,
    };

    // 添加 system prompt
    if (systemMessages.length > 0) {
      anthropicReq.system = systemMessages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
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

    // 添加元数据
    if (request.metadata?.userId) {
      anthropicReq.metadata = {
        user_id: request.metadata.userId as string,
      };
    }

    logger.debug(
      { requestId: ctx.requestId, model: request.model },
      'Adapted to Anthropic format',
    );

    return {
      body: anthropicReq,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
    };
  }

  /**
   * 将 Anthropic 响应转换为标准格式
   */
  async normalizeResponse(response: Response, ctx: TransformerContext): Promise<StandardResponse> {
    const data: AnthropicResponse = await response.json();

    // 提取文本内容和工具调用
    let content = '';
    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }> = [];

    for (const block of data.content) {
      if (block.type === 'text' && block.text) {
        content += block.text;
      } else if (block.type === 'tool_use' && block.id) {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name || '',
            arguments: JSON.stringify(block.input || {}),
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
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return new ReadableStream({
      start: async (controller) => {
        const reader = stream.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('event: ')) continue;

              const eventLine = line.slice(7);
              const dataLine = lines.find((l) => l.startsWith('data: '));
              if (!dataLine) continue;

              const data = dataLine.slice(6);

              try {
                const event: AnthropicStreamEvent = JSON.parse(data);
                const converted = this.convertStreamEvent(event);
                if (converted) {
                  controller.enqueue(encoder.encode(`event: ${event.type}\n`));
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(converted)}\n\n`));
                }
              } catch (error) {
                logger.error({ error, data }, 'Failed to parse Anthropic stream event');
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

    // 提取 tool_calls 和 tool_call_id
    let toolCalls;
    let toolCallId;

    if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'tool_use') {
          if (!toolCalls) toolCalls = [];
          toolCalls.push({
            id: item.id || '',
            type: 'function' as const,
            function: {
              name: item.name || '',
              arguments: JSON.stringify(item.input || {}),
            },
          });
        } else if (item.type === 'tool_result') {
          toolCallId = item.tool_use_id;
        }
      }
    }

    return {
      role: msg.role,
      content,
      tool_calls: toolCalls,
      tool_call_id: toolCallId,
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
        parameters: tool.input_schema,
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

      // 处理 tool_calls
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (Array.isArray(content)) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments || '{}'),
            });
          }
        }
      }

      // 处理 tool_result
      if (msg.tool_call_id) {
        if (Array.isArray(content)) {
          content.push({
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: typeof msg.content === 'string' ? msg.content : '',
          });
        }
      }

      return {
        role: msg.role === 'system' ? 'user' : msg.role,
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
    return {
      name: tool.function.name,
      description: tool.function.description || '',
      input_schema: tool.function.parameters || { type: 'object' },
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

  private convertStreamEvent(event: AnthropicStreamEvent): unknown {
    // 简化的流事件转换
    return event;
  }
}
