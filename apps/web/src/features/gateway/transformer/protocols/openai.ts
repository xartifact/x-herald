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

import { cleanSchemaForOpenAI } from '../utils/schema-cleaner';

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

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAITransformer implements Transformer {
  readonly name = 'openai';
  readonly supportedProtocols: ('openai' | 'anthropic' | 'gemini' | 'vertex' | 'custom')[] = ['openai'];

  /**
   * 将 OpenAI 请求转换为标准格式
   */
  async normalizeRequest(request: unknown, ctx: TransformerContext): Promise<StandardRequest> {
    const openaiReq = request as OpenAIRequest;

    logger.debug(
      { requestId: ctx.requestId, model: openaiReq.model },
      'Normalizing OpenAI request',
    );

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
      response_format: openaiReq.response_format,
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
    const openaiReq: OpenAIRequest = {
      model: request.model,
      messages: this.convertToOpenAIMessages(request.messages),
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      frequency_penalty: request.frequency_penalty,
      presence_penalty: request.presence_penalty,
      stream: request.stream,
      stop: request.stop,
      seed: request.seed,
    };

    // 添加可选字段
    if (request.tools?.length) {
      // 防御性清理：确保 Schema 符合规范
      openaiReq.tools = request.tools.map(tool => ({
        ...tool,
        function: {
          ...tool.function,
          parameters: tool.function.parameters
            ? cleanSchemaForOpenAI(tool.function.parameters) as typeof tool.function.parameters
            : tool.function.parameters,
        },
      }));

      if (request.tool_choice) {
        openaiReq.tool_choice = request.tool_choice;
      }
    }

    if (request.response_format) {
      openaiReq.response_format = request.response_format;
    }

    logger.debug(
      { requestId: ctx.requestId, model: request.model },
      'Adapted to OpenAI format',
    );

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
    const data = await response.json();

    return {
      id: data.id,
      object: data.object || 'chat.completion',
      created: data.created || Math.floor(Date.now() / 1000),
      model: data.model,
      choices: (data.choices as OpenAIChoice[])?.map((choice) => ({
        index: choice.index,
        message: choice.message
          ? {
              role: choice.message.role as StandardMessage['role'],
              content: choice.message.content || '',
              tool_calls: choice.message.tool_calls,
            }
          : undefined,
        finish_reason: this.mapFinishReason(choice.finish_reason),
      })),
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
      choices: response.choices?.map((choice) => ({
        index: choice.index,
        message: choice.message
          ? {
              role: choice.message.role,
              content: choice.message.content,
              tool_calls: choice.message.tool_calls,
            }
          : undefined,
        finish_reason: choice.finish_reason,
      })),
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
                const standardChunk = this.convertStreamChunk(chunk);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(standardChunk)}\n\n`));
              } catch (error) {
                logger.error({ error, data }, 'Failed to parse stream chunk');
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

  private convertMessages(messages: OpenAIMessage[]): StandardMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: this.convertContent(msg.content),
      tool_calls: msg.tool_calls ? this.normalizeToolCalls(msg.tool_calls) : undefined,
      tool_call_id: msg.tool_call_id,
      name: msg.name,
    }));
  }

  /**
   * 规范化 tool_calls，确保 arguments 始终是 JSON 字符串
   * 某些客户端可能发送对象而不是字符串，需要统一处理
   */
  private normalizeToolCalls(toolCalls: OpenAIMessage['tool_calls']): ToolCall[] {
    if (!toolCalls) return [];

    return toolCalls.map((tc) => ({
      id: tc.id,
      type: tc.type,
      function: {
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function.arguments),
      },
    }));
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
          tool_calls: choice.delta.tool_calls?.map((tc) => ({
            index: tc.index,
            id: tc.id,
            type: tc.type,
            function: tc.function,
          })),
        },
        finish_reason: choice.finish_reason,
      })),
    };
  }

  private mapFinishReason(reason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' | null {
    if (!reason) return null;
    if (['stop', 'length', 'tool_calls', 'content_filter'].includes(reason)) {
      return reason as 'stop' | 'length' | 'tool_calls' | 'content_filter';
    }
    return null;
  }

}
