/**
 * OpenAI 协议转换器测试
 * 验证 OpenAI 格式与标准格式之间的正确转换
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import type { TransformerContext, StandardRequest, StandardResponse } from '@/types';

import { OpenAITransformer } from '../openai';

describe('OpenAITransformer', () => {
  let transformer: OpenAITransformer;
  let ctx: TransformerContext;

  beforeEach(() => {
    transformer = new OpenAITransformer();
    ctx = {
      requestId: 'test-request-id',
      provider: { id: 'test-provider', name: 'Test Provider' },
      metadata: {},
    };
  });

  describe('基本属性', () => {
    it('应该具有正确的名称', () => {
      expect(transformer.name).toBe('openai');
    });

    it('应该支持 OpenAI 协议', () => {
      expect(transformer.supportedProtocols).toContain('openai');
    });
  });

  describe('normalizeRequest - OpenAI 请求转标准格式', () => {
    it('应该转换基本的聊天请求', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user' as const, content: 'Hello!' },
        ],
        temperature: 0.7,
        max_tokens: 100,
        top_p: 0.9,
        stream: false,
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      expect(result.model).toBe('gpt-4o');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hello!');
      expect(result.temperature).toBe(0.7);
      expect(result.max_tokens).toBe(100);
      expect(result.top_p).toBe(0.9);
      expect(result.stream).toBe(false);
    });

    it('应该处理 max_completion_tokens 参数', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        max_completion_tokens: 200,
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      expect(result.max_tokens).toBe(200);
    });

    it('应该处理多模态消息（图片）', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: 'Describe this image:' },
              { type: 'image_url' as const, image_url: { url: 'https://example.com/image.jpg' } },
            ],
          },
        ],
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      expect(Array.isArray(result.messages[0].content)).toBe(true);
      const content = result.messages[0].content as Array<{ type: string }>;
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe('text');
      expect(content[1].type).toBe('image_url');
    });

    it('应该转换工具调用请求', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user' as const, content: 'What is the weather?' },
          {
            role: 'assistant' as const,
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function' as const,
                function: {
                  name: 'get_weather',
                  arguments: '{"location": "SF"}',
                },
              },
            ],
          },
          {
            role: 'tool' as const,
            tool_call_id: 'call_123',
            content: '{"temp": 72}',
          },
        ],
        tools: [
          {
            type: 'function' as const,
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        tool_choice: 'auto' as const,
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      expect(result.tools).toHaveLength(1);
      expect(result.tools![0].function.name).toBe('get_weather');
      expect(result.messages[1].tool_calls).toHaveLength(1);
      expect(result.messages[2].tool_call_id).toBe('call_123');
    });

    it('应该处理 stop 序列（字符串）', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        stop: 'END',
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      expect(result.stop).toBe('END');
    });

    it('应该处理 stop 序列（数组）', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        stop: ['END', 'STOP'],
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      expect(Array.isArray(result.stop)).toBe(true);
      expect(result.stop).toEqual(['END', 'STOP']);
    });

    it('应该处理 response_format', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'List colors' }],
        response_format: { type: 'json_object' as const },
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      expect(result.response_format?.type).toBe('json_object');
    });

    it('应该包含 originalProvider 元数据', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      expect(result.metadata?.originalProvider).toBe('openai');
    });
  });

  describe('adaptRequest - 标准格式转 OpenAI 请求', () => {
    it('应该转换标准请求为 OpenAI 格式', async () => {
      const standardRequest: StandardRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello!' }],
        temperature: 0.5,
        max_tokens: 100,
        top_p: 0.95,
        stream: false,
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;

      expect(body.model).toBe('gpt-4o');
      expect(body.messages).toHaveLength(1);
      expect(body.temperature).toBe(0.5);
      expect(body.max_tokens).toBe(100);
      expect(body.top_p).toBe(0.95);
      expect(body.stream).toBe(false);
      expect(result.headers?.['Content-Type']).toBe('application/json');
    });

    it('应该转换工具定义', async () => {
      const standardRequest: StandardRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather info',
              parameters: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
              },
            },
          },
        ],
        tool_choice: 'auto',
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;

      expect(body.tools).toHaveLength(1);
      expect((body.tools as Array<Record<string, unknown>>)[0].type).toBe('function');
      expect(body.tool_choice).toBe('auto');
    });

    it('应该保留 tool parameters 中的 additionalProperties（OpenAI 要求）', async () => {
      const standardRequest: StandardRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather info',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                  units: {
                    type: 'string',
                    enum: ['celsius', 'fahrenheit'],
                  },
                },
                required: ['location', 'units'],
                additionalProperties: false, // OpenAI 要求保留此字段
              },
            },
          },
        ],
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;
      const tools = body.tools as Array<{
        type: string;
        function: {
          name: string;
          description: string;
          parameters: Record<string, unknown>;
        };
      }>;

      expect(tools).toHaveLength(1);
      const params = tools[0].function.parameters;

      // 验证 additionalProperties 被保留
      expect(params.additionalProperties).toBe(false);
      // 验证其他字段也正确保留
      expect(params.type).toBe('object');
      expect(params.required).toEqual(['location', 'units']);
      expect(params.properties).toBeDefined();
    });

    it('应该转换多模态内容', async () => {
      const standardRequest: StandardRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe:' },
              { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
            ],
          },
        ],
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;
      const messages = body.messages as Array<{ content: unknown }>;

      expect(Array.isArray(messages[0].content)).toBe(true);
    });

    it('应该处理函数类型的 tool_choice', async () => {
      const standardRequest: StandardRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        tool_choice: {
          type: 'function',
          function: { name: 'get_weather' },
        },
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;

      expect(body.tool_choice).toEqual({
        type: 'function',
        function: { name: 'get_weather' },
      });
    });
  });

  describe('normalizeResponse - OpenAI 响应转标准格式', () => {
    it('应该转换基本响应', async () => {
      const openaiResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello there!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const response = new Response(JSON.stringify(openaiResponse));
      const result = await transformer.normalizeResponse(response, ctx);

      expect(result.id).toBe('chatcmpl-123');
      expect(result.model).toBe('gpt-4o');
      expect(result.choices[0].message.content).toBe('Hello there!');
      expect(result.choices[0].finish_reason).toBe('stop');
      expect(result.usage?.prompt_tokens).toBe(10);
      expect(result.usage?.completion_tokens).toBe(5);
    });

    it('应该转换工具调用响应', async () => {
      const openaiResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_789',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location": "SF"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      };

      const response = new Response(JSON.stringify(openaiResponse));
      const result = await transformer.normalizeResponse(response, ctx);

      expect(result.choices[0].finish_reason).toBe('tool_calls');
      expect(result.choices[0].message.tool_calls).toHaveLength(1);
      expect(result.choices[0].message.tool_calls![0].function.name).toBe('get_weather');
    });

    it('应该处理缺失的 usage 字段', async () => {
      const openaiResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hi!' },
            finish_reason: 'stop',
          },
        ],
      };

      const response = new Response(JSON.stringify(openaiResponse));
      const result = await transformer.normalizeResponse(response, ctx);

      expect(result.usage).toBeUndefined();
    });
  });

  describe('adaptResponse - 标准响应转 OpenAI 格式', () => {
    it('应该转换标准响应为 OpenAI 格式', async () => {
      const standardResponse: StandardResponse = {
        id: 'msg-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 2,
          total_tokens: 7,
        },
      };

      const result = await transformer.adaptResponse(standardResponse, ctx);
      const data = await result.json();

      expect(data.id).toBe('msg-123');
      expect(data.object).toBe('chat.completion');
      expect(data.model).toBe('gpt-4o');
      expect(data.choices[0].message.content).toBe('Hello!');
      expect(data.choices[0].finish_reason).toBe('stop');
    });

    it('应该设置正确的 Content-Type 头', async () => {
      const standardResponse: StandardResponse = {
        id: 'msg-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hi!' },
            finish_reason: 'stop',
          },
        ],
      };

      const result = await transformer.adaptResponse(standardResponse, ctx);

      expect(result.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('transformStream - 流式响应转换', () => {
    it('应该转换流式响应', async () => {
      const chunks = [
        { id: 'chatcmpl-123', object: 'chat.completion.chunk', created: 1677652288, model: 'gpt-4o', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] },
        { id: 'chatcmpl-123', object: 'chat.completion.chunk', created: 1677652288, model: 'gpt-4o', choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }] },
        { id: 'chatcmpl-123', object: 'chat.completion.chunk', created: 1677652288, model: 'gpt-4o', choices: [{ index: 0, delta: { content: '!' }, finish_reason: 'stop' }] },
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      const transformed = await transformer.transformStream(stream, ctx);
      const reader = transformed.getReader();
      const decoder = new TextDecoder();

      let output = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value);
      }

      expect(output).toContain('data: ');
      expect(output).toContain('[DONE]');
      expect(output).toContain('Hello');
    });

    it('应该处理工具调用的流式响应', async () => {
      const chunks = [
        { id: 'chatcmpl-123', object: 'chat.completion.chunk', created: 1677652288, model: 'gpt-4o', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_123', type: 'function', function: { name: 'get_weather', arguments: '' } }] }, finish_reason: null }] },
        { id: 'chatcmpl-123', object: 'chat.completion.chunk', created: 1677652288, model: 'gpt-4o', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"loc' } }] }, finish_reason: null }] },
        { id: 'chatcmpl-123', object: 'chat.completion.chunk', created: 1677652288, model: 'gpt-4o', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'ation": "SF"}' } }] }, finish_reason: 'tool_calls' }] },
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          controller.close();
        },
      });

      const transformed = await transformer.transformStream(stream, ctx);
      const reader = transformed.getReader();
      const decoder = new TextDecoder();

      let output = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += decoder.decode(value);
      }

      expect(output).toContain('call_123');
      expect(output).toContain('get_weather');
    });
  });

  describe('边界情况处理', () => {
    it('应该处理空消息内容', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: '' }],
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      expect(result.messages[0].content).toBe('');
    });

    it('应该处理 null content', async () => {
      const openaiResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: null },
            finish_reason: 'stop',
          },
        ],
      };

      const response = new Response(JSON.stringify(openaiResponse));
      const result = await transformer.normalizeResponse(response, ctx);

      expect(result.choices[0].message.content).toBe('');
    });

    it('应该处理频率和存在惩罚参数', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      expect(result.frequency_penalty).toBe(0.5);
      expect(result.presence_penalty).toBe(0.3);
    });

    it('应该处理 seed 参数', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        seed: 42,
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      expect(result.seed).toBe(42);
    });

    it('应该保持 tool_calls 的 arguments 为 JSON 字符串（OpenAI 标准）', async () => {
      // 模拟包含 tool_calls 的多轮对话场景
      const standardRequest: StandardRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: 'Get weather in SF' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_abc123',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location":"SF","unit":"celsius"}', // 标准格式中是 JSON 字符串
                },
              },
            ],
          },
          {
            role: 'tool',
            tool_call_id: 'call_abc123',
            content: '{"temperature":20,"condition":"sunny"}',
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object', properties: { location: { type: 'string' } } },
            },
          },
        ],
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;
      const messages = body.messages as Array<{
        role: string;
        content?: string;
        tool_calls?: Array<{
          id: string;
          type: string;
          function: {
            name: string;
            arguments: string; // OpenAI 标准：应该是 JSON 字符串
          };
        }>;
      }>;

      // 验证 assistant 消息中的 tool_calls
      const assistantMsg = messages[1];
      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.tool_calls).toBeDefined();
      expect(assistantMsg.tool_calls).toHaveLength(1);

      const toolCall = assistantMsg.tool_calls![0];
      expect(toolCall.id).toBe('call_abc123');
      expect(toolCall.function.name).toBe('get_weather');

      // 关键验证：arguments 应该保持为 JSON 字符串（OpenAI 标准）
      expect(typeof toolCall.function.arguments).toBe('string');
      expect(toolCall.function.arguments).toBe('{"location":"SF","unit":"celsius"}');
      // 验证字符串是有效的 JSON
      expect(() => JSON.parse(toolCall.function.arguments)).not.toThrow();
    });

    it('应该将对象类型的 arguments 转换为 JSON 字符串（兼容非标准客户端）', async () => {
      // 某些客户端可能发送对象而不是字符串，需要兼容处理
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user' as const, content: 'Get weather' },
          {
            role: 'assistant' as const,
            content: '',
            tool_calls: [
              {
                id: 'call_123',
                type: 'function' as const,
                function: {
                  name: 'get_weather',
                  // 错误：某些客户端可能发送对象而不是字符串
                  arguments: { location: 'SF', unit: 'celsius' } as unknown as string,
                },
              },
            ],
          },
        ],
      };

      const result = await transformer.normalizeRequest(openaiRequest, ctx);

      // 验证 arguments 被正确转换为字符串
      const assistantMsg = result.messages[1];
      expect(assistantMsg.tool_calls).toBeDefined();
      expect(assistantMsg.tool_calls).toHaveLength(1);

      const toolCall = assistantMsg.tool_calls![0];
      expect(typeof toolCall.function.arguments).toBe('string');
      expect(toolCall.function.arguments).toBe('{"location":"SF","unit":"celsius"}');
      // 验证是有效的 JSON
      expect(() => JSON.parse(toolCall.function.arguments)).not.toThrow();
    });
  });
});
