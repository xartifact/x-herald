/**
 * Anthropic 协议转换器测试
 * 验证 Anthropic 格式与标准格式之间的正确转换
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import type { TransformerContext, StandardRequest, StandardResponse } from '@/types';

import { AnthropicTransformer } from '../anthropic';

describe('AnthropicTransformer', () => {
  let transformer: AnthropicTransformer;
  let ctx: TransformerContext;

  beforeEach(() => {
    transformer = new AnthropicTransformer();
    ctx = {
      requestId: 'test-request-id',
      provider: { id: 'test-provider', name: 'Test Provider' },
      metadata: {},
      state: new Map<string, unknown>(), // 添加 state 属性
    };
  });

  describe('基本属性', () => {
    it('应该具有正确的名称', () => {
      expect(transformer.name).toBe('anthropic');
    });

    it('应该支持 Anthropic 协议', () => {
      expect(transformer.supportedProtocols).toContain('anthropic');
    });
  });

  describe('normalizeRequest - Anthropic 请求转标准格式', () => {
    it('应该转换基本的聊天请求', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [
          { role: 'user' as const, content: 'Hello!' },
        ],
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.9,
        stream: false,
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      expect(result.model).toBe('claude-sonnet-4-5-20250929');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hello!');
      expect(result.max_tokens).toBe(100);
      expect(result.temperature).toBe(0.7);
      expect(result.top_p).toBe(0.9);
    });

    it('应该处理 system prompt', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        system: 'You are a helpful assistant.',
        messages: [
          { role: 'user' as const, content: 'Hello!' },
        ],
        max_tokens: 100,
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toBe('You are a helpful assistant.');
    });

    it('应该转换工具调用请求', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [
          { role: 'user' as const, content: 'What is the weather?' },
          {
            role: 'assistant' as const,
            content: [
              {
                type: 'tool_use' as const,
                id: 'toolu_123',
                name: 'get_weather',
                input: { location: 'SF' },
              },
            ],
          },
          {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result' as const,
                tool_use_id: 'toolu_123',
                content: '{"temp": 72}',
              },
            ],
          },
        ],
        max_tokens: 100,
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather info',
            input_schema: {
              type: 'object' as const,
              properties: { location: { type: 'string' } },
              required: ['location'],
            },
          },
        ],
        tool_choice: { type: 'auto' as const },
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      expect(result.tools).toHaveLength(1);
      expect(result.tools![0].function.name).toBe('get_weather');
      expect(result.messages[1].tool_calls).toHaveLength(1);
      expect(result.messages[1].tool_calls![0].id).toBe('toolu_123');
    });

    it('应该处理多模态消息（base64 图片）', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: 'Describe this:' },
              {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: 'image/jpeg',
                  data: 'base64encodeddata',
                },
              },
            ],
          },
        ],
        max_tokens: 100,
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      const content = result.messages[0].content as Array<{ type: string; image_url?: { url: string } }>;
      expect(content).toHaveLength(2);
      expect(content[1].type).toBe('image_url');
      expect(content[1].image_url?.url).toBe('data:image/jpeg;base64,base64encodeddata');
    });

    it('应该处理 URL 图片', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'image' as const,
                source: {
                  type: 'url' as const,
                  url: 'https://example.com/image.jpg',
                },
              },
            ],
          },
        ],
        max_tokens: 100,
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      const content = result.messages[0].content as Array<{ type: string; image_url?: { url: string } }>;
      expect(content[0].image_url?.url).toBe('https://example.com/image.jpg');
    });

    it('应该处理 thinking/reasoning 模式', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user' as const, content: 'Solve this' }],
        max_tokens: 2000,
        thinking: {
          type: 'enabled' as const,
          budget_tokens: 1024,
        },
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      expect(result.reasoning?.enabled).toBe(true);
      expect(result.reasoning?.max_tokens).toBe(1024);
    });

    it('应该处理 stop_sequences', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        max_tokens: 100,
        stop_sequences: ['END', 'STOP'],
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      expect(result.stop).toEqual(['END', 'STOP']);
    });

    it('应该处理 metadata', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        max_tokens: 100,
        metadata: {
          user_id: 'user-123',
        },
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      expect(result.metadata?.userId).toBe('user-123');
      expect(result.metadata?.originalProvider).toBe('anthropic');
    });

    it('应该处理 tool_choice: any', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        max_tokens: 100,
        tools: [{ name: 'test', input_schema: { type: 'object' } }],
        tool_choice: { type: 'any' as const },
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      expect(result.tool_choice).toBe('required');
    });

    it('应该处理 tool_choice: tool', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        max_tokens: 100,
        tools: [{ name: 'get_weather', input_schema: { type: 'object' } }],
        tool_choice: { type: 'tool' as const, name: 'get_weather' },
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      expect(result.tool_choice).toEqual({
        type: 'function',
        function: { name: 'get_weather' },
      });
    });
  });

  describe('adaptRequest - 标准格式转 Anthropic 请求', () => {
    it('应该转换标准请求为 Anthropic 格式', async () => {
      const standardRequest: StandardRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hello!' }],
        temperature: 0.5,
        max_tokens: 100,
        top_p: 0.95,
        stream: false,
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;

      expect(body.model).toBe('claude-sonnet-4-5-20250929');
      expect(body.messages).toHaveLength(1);
      expect(body.max_tokens).toBe(100);
      expect(body.temperature).toBe(0.5);
      expect(body.top_p).toBe(0.95);
      expect(result.headers?.['anthropic-version']).toBe('2023-06-01');
    });

    it('应该分离 system 消息到单独的字段', async () => {
      const standardRequest: StandardRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [
          { role: 'system', content: 'Be helpful.' },
          { role: 'user', content: 'Hello!' },
        ],
        max_tokens: 100,
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;

      expect(body.system).toBe('Be helpful.');
      expect(body.messages).toHaveLength(1);
      expect((body.messages as Array<{ role: string }>)[0].role).toBe('user');
    });

    it('应该合并多个 system 消息', async () => {
      const standardRequest: StandardRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [
          { role: 'system', content: 'Be helpful.' },
          { role: 'system', content: 'Be concise.' },
          { role: 'user', content: 'Hello!' },
        ],
        max_tokens: 100,
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;

      expect(body.system).toBe('Be helpful.\nBe concise.');
    });

    it('应该转换工具定义', async () => {
      const standardRequest: StandardRequest = {
        model: 'claude-sonnet-4-5-20250929',
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
        max_tokens: 100,
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;
      const tools = body.tools as Array<{ name: string; input_schema: unknown }>;

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('get_weather');
      expect(tools[0].input_schema).toEqual({
        type: 'object',
        properties: { location: { type: 'string' } },
        required: ['location'],
      });
    });

    it('应该转换 tool_choice', async () => {
      const standardRequest: StandardRequest = {
        model: 'claude-sonnet-4-5-20250929',
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
        tool_choice: 'required',
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;

      expect(body.tool_choice).toEqual({ type: 'any' });
    });

    it('应该转换多模态内容', async () => {
      const standardRequest: StandardRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe:' },
              { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
            ],
          },
        ],
        max_tokens: 100,
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;
      const messages = body.messages as Array<{ content: Array<{ type: string; source?: { type: string; url: string } }> }>;

      expect(messages[0].content).toHaveLength(2);
      expect(messages[0].content[1].type).toBe('image');
      expect(messages[0].content[1].source?.type).toBe('url');
    });

    it('应该转换 base64 图片', async () => {
      const standardRequest: StandardRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
            ],
          },
        ],
        max_tokens: 100,
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;
      const messages = body.messages as Array<{ content: Array<{ type: string; source?: { type: string; media_type: string; data: string } }> }>;

      expect(messages[0].content[0].type).toBe('image');
      expect(messages[0].content[0].source?.type).toBe('base64');
      expect(messages[0].content[0].source?.media_type).toBe('image/png');
      expect(messages[0].content[0].source?.data).toBe('abc123');
    });

    it('应该转换 stop 序列', async () => {
      const standardRequest: StandardRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hello' }],
        stop: ['END', 'STOP'],
        max_tokens: 100,
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;

      expect(body.stop_sequences).toEqual(['END', 'STOP']);
    });

    it('应该转换 reasoning 为 thinking', async () => {
      const standardRequest: StandardRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Solve this' }],
        reasoning: { enabled: true, max_tokens: 1024 },
        max_tokens: 2000,
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;

      expect(body.thinking).toEqual({
        type: 'enabled',
        budget_tokens: 1024,
      });
    });

    it('应该转换 userId 到 metadata', async () => {
      const standardRequest: StandardRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hello' }],
        metadata: { userId: 'user-123' },
        max_tokens: 100,
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;

      expect(body.metadata).toEqual({ user_id: 'user-123' });
    });
  });

  describe('normalizeResponse - Anthropic 响应转标准格式', () => {
    it('应该转换基本响应', async () => {
      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5-20250929',
        content: [{ type: 'text', text: 'Hello there!' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const response = new Response(JSON.stringify(anthropicResponse));
      const result = await transformer.normalizeResponse(response, ctx);

      expect(result.id).toBe('msg_123');
      expect(result.model).toBe('claude-sonnet-4-5-20250929');
      expect(result.choices[0].message.content).toBe('Hello there!');
      expect(result.choices[0].finish_reason).toBe('stop');
      expect(result.usage?.prompt_tokens).toBe(10);
      expect(result.usage?.completion_tokens).toBe(5);
    });

    it('应该转换工具调用响应', async () => {
      const anthropicResponse = {
        id: 'msg_456',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5-20250929',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_789',
            name: 'get_weather',
            input: { location: 'SF' },
          },
        ],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 20, output_tokens: 10 },
      };

      const response = new Response(JSON.stringify(anthropicResponse));
      const result = await transformer.normalizeResponse(response, ctx);

      expect(result.choices[0].finish_reason).toBe('tool_calls');
      expect(result.choices[0].message.tool_calls).toHaveLength(1);
      expect(result.choices[0].message.tool_calls![0].id).toBe('toolu_789');
      expect(result.choices[0].message.tool_calls![0].function.name).toBe('get_weather');
    });

    it('应该处理缓存 token 统计', async () => {
      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5-20250929',
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 500,
          cache_creation_input_tokens: 1000,
        },
      };

      const response = new Response(JSON.stringify(anthropicResponse));
      const result = await transformer.normalizeResponse(response, ctx);

      expect(result.usage?.prompt_tokens_details?.cached_tokens).toBe(500);
    });

    it('应该处理 max_tokens 停止原因', async () => {
      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5-20250929',
        content: [{ type: 'text', text: 'Partial...' }],
        stop_reason: 'max_tokens',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 100 },
      };

      const response = new Response(JSON.stringify(anthropicResponse));
      const result = await transformer.normalizeResponse(response, ctx);

      expect(result.choices[0].finish_reason).toBe('length');
    });
  });

  describe('adaptResponse - 标准响应转 Anthropic 格式', () => {
    it('应该转换标准响应为 Anthropic 格式', async () => {
      const standardResponse: StandardResponse = {
        id: 'resp-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'claude-sonnet-4-5-20250929',
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
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      };

      const result = await transformer.adaptResponse(standardResponse, ctx);
      const data = await result.json();

      expect(data.id).toBe('resp-123');
      expect(data.type).toBe('message');
      expect(data.role).toBe('assistant');
      expect(data.model).toBe('claude-sonnet-4-5-20250929');
      expect(data.content).toHaveLength(1);
      expect(data.content[0].type).toBe('text');
      expect(data.content[0].text).toBe('Hello!');
      expect(data.stop_reason).toBe('end_turn');
    });

    it('应该转换工具调用响应', async () => {
      const standardResponse: StandardResponse = {
        id: 'resp-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'claude-sonnet-4-5-20250929',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_123',
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
      };

      const result = await transformer.adaptResponse(standardResponse, ctx);
      const data = await result.json();

      expect(data.content).toHaveLength(1);
      expect(data.content[0].type).toBe('tool_use');
      expect(data.content[0].id).toBe('call_123');
      expect(data.content[0].name).toBe('get_weather');
      expect(data.content[0].input).toEqual({ location: 'SF' });
      expect(data.stop_reason).toBe('tool_use');
    });

    it('应该设置正确的 Content-Type', async () => {
      const standardResponse: StandardResponse = {
        id: 'resp-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'claude-sonnet-4-5-20250929',
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
    it('应该处理空的流', async () => {
      const stream = new ReadableStream({
        start(controller) {
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

      // 空流应该输出 [DONE] 标记
      expect(output).toContain('[DONE]');
    });

    it('应该透传有效的流式事件', async () => {
      // 模拟 Anthropic SSE 格式输入：完整的 event + data 对
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // 发送完整的 SSE 事件（event + data 在同一批）
          const event1 = `event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","model":"claude-sonnet-4-5-20250929","content":[],"stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n`;
          controller.enqueue(encoder.encode(event1));

          const event2 = `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n`;
          controller.enqueue(encoder.encode(event2));

          const event3 = `event: message_stop\ndata: {"type":"message_stop"}\n\n`;
          controller.enqueue(encoder.encode(event3));

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

      // 验证输出已转换为标准格式（默认 normalize 方向）
      expect(output).toContain('data:'); // 标准格式使用 data:
      expect(output).toContain('chat.completion.chunk'); // 标准对象类型
      expect(output).toContain('Hello'); // 内容应该保留
      expect(output).toContain('[DONE]'); // 标准流结束标记
    });
  });

  describe('Schema 清理', () => {
    it('应该从工具定义中移除 $schema 元数据字段', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user' as const, content: 'Use the tool' }],
        max_tokens: 100,
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            input_schema: {
              $schema: 'http://json-schema.org/draft-07/schema#',
              type: 'object' as const,
              properties: {
                param1: { type: 'string' },
              },
              required: ['param1'],
            },
          },
        ],
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      expect(result.tools).toHaveLength(1);
      const params = result.tools![0].function.parameters as Record<string, unknown>;
      expect(params.$schema).toBeUndefined();
      expect(params.type).toBe('object');
      expect(params.properties).toBeDefined();
    });

    it('应该保留工具定义中的 additionalProperties 字段（OpenAI 要求）', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user' as const, content: 'Use the tool' }],
        max_tokens: 100,
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            input_schema: {
              type: 'object' as const,
              properties: {
                param1: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        ],
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      const params = result.tools![0].function.parameters as Record<string, unknown>;
      // additionalProperties 应该被保留（OpenAI 标准要求）
      expect(params.additionalProperties).toBe(false);
    });

    it('应该保留工具定义中的有效约束字段', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user' as const, content: 'Use the tool' }],
        max_tokens: 100,
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            input_schema: {
              type: 'object' as const,
              properties: {
                color: {
                  type: 'string',
                  enum: ['red', 'green', 'blue'],
                  description: 'Color choice',
                },
                email: {
                  type: 'string',
                  format: 'email',
                  pattern: '^[a-z]+@[a-z]+\\.[a-z]+$',
                },
              },
              required: ['color'],
            },
          },
        ],
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      const params = result.tools![0].function.parameters as Record<string, unknown>;
      const properties = params.properties as Record<string, Record<string, unknown>>;

      expect(properties.color.enum).toEqual(['red', 'green', 'blue']);
      expect(properties.color.description).toBe('Color choice');
      expect(properties.email.format).toBe('email');
      expect(properties.email.pattern).toBe('^[a-z]+@[a-z]+\\.[a-z]+$');
    });

    it('应该递归清理嵌套的工具参数 Schema', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user' as const, content: 'Use the tool' }],
        max_tokens: 100,
        tools: [
          {
            name: 'complex_tool',
            description: 'A complex tool',
            input_schema: {
              $schema: 'http://json-schema.org/draft-07/schema#',
              type: 'object' as const,
              properties: {
                nested: {
                  type: 'object',
                  $id: 'nested-schema',
                  properties: {
                    field: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
        ],
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      const params = result.tools![0].function.parameters as Record<string, unknown>;
      const nested = (params.properties as Record<string, Record<string, unknown>>).nested;

      expect(params.$schema).toBeUndefined();
      expect(nested.$id).toBeUndefined();
      // additionalProperties 应该被保留（OpenAI 要求）
      expect(nested.additionalProperties).toBe(false);
      expect(nested.type).toBe('object');
    });
  });

  describe('边界情况处理', () => {
    it('应该处理空 content 数组', async () => {
      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5-20250929',
        content: [],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      };

      const response = new Response(JSON.stringify(anthropicResponse));
      const result = await transformer.normalizeResponse(response, ctx);

      expect(result.choices[0].message.content).toBe('');
    });

    it('应该处理空字符串 content', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user' as const, content: '' }],
        max_tokens: 100,
      };

      const result = await transformer.normalizeRequest(anthropicRequest, ctx);

      expect(result.messages[0].content).toBe('');
    });

    it('应该处理 max_tokens 默认值', async () => {
      const standardRequest: StandardRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const result = await transformer.adaptRequest(standardRequest, ctx);
      const body = result.body as Record<string, unknown>;

      expect(body.max_tokens).toBe(4096);
    });

    it('应该处理未知的 stop_reason', async () => {
      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5-20250929',
        content: [{ type: 'text', text: 'Hello' }],
        stop_reason: 'unknown_reason',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const response = new Response(JSON.stringify(anthropicResponse));
      const result = await transformer.normalizeResponse(response, ctx);

      expect(result.choices[0].finish_reason).toBeNull();
    });
  });
});
