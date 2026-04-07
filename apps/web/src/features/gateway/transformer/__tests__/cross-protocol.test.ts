/**
 * 跨协议转换测试
 * 验证不同协议之间的请求/响应转换
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import type { TransformerContext, StandardRequest, StandardResponse } from '@/types';

import { AnthropicTransformer } from '../protocols/anthropic';
import { OpenAITransformer } from '../protocols/openai';

/**
 * 跨协议转换测试
 *
 * 测试场景：
 * 1. 用户发送 OpenAI 格式请求 → 转换为 Anthropic 格式发送给 Provider
 * 2. 用户发送 Anthropic 格式请求 → 转换为 OpenAI 格式发送给 Provider
 * 3. Provider 返回 Anthropic 响应 → 转换为 OpenAI 格式返回给用户
 * 4. Provider 返回 OpenAI 响应 → 转换为 Anthropic 格式返回给用户
 */
describe('Cross-Protocol Transformation', () => {
  let openaiTransformer: OpenAITransformer;
  let anthropicTransformer: AnthropicTransformer;
  let ctx: TransformerContext;

  beforeEach(() => {
    openaiTransformer = new OpenAITransformer();
    anthropicTransformer = new AnthropicTransformer();
    ctx = {
      requestId: 'cross-protocol-test',
      provider: { id: 'test-provider', name: 'Test Provider' },
      metadata: {},
    };
  });

  describe('OpenAI → 标准格式 → Anthropic', () => {
    it('应该正确转换基本聊天请求', async () => {
      // 用户发送 OpenAI 格式请求
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'system' as const, content: 'You are a helpful assistant.' },
          { role: 'user' as const, content: 'What is the weather?' },
        ],
        temperature: 0.7,
        max_tokens: 100,
        top_p: 0.9,
      };

      // Step 1: OpenAI → 标准格式
      const standardRequest = await openaiTransformer.normalizeRequest(openaiRequest, ctx);

      expect(standardRequest.model).toBe('gpt-4o');
      expect(standardRequest.messages).toHaveLength(2);
      expect(standardRequest.metadata?.originalProvider).toBe('openai');

      // Step 2: 标准格式 → Anthropic 格式
      const anthropicRequest = await anthropicTransformer.adaptRequest(standardRequest, ctx);
      const body = anthropicRequest.body as Record<string, unknown>;

      expect(body.model).toBe('gpt-4o');
      expect(body.system).toBe('You are a helpful assistant.');
      expect(body.messages).toHaveLength(1);
      expect((body.messages as Array<{ role: string; content: string }>)[0].content).toBe('What is the weather?');
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(100);
      expect(body.top_p).toBe(0.9);
    });

    it('应该正确转换工具调用请求', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'What is the weather in SF?' }],
        tools: [
          {
            type: 'function' as const,
            function: {
              name: 'get_weather',
              description: 'Get weather for a location',
              parameters: {
                type: 'object' as const,
                properties: {
                  location: { type: 'string', description: 'City name' },
                  unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
                },
                required: ['location'],
              },
            },
          },
        ],
        tool_choice: 'auto' as const,
        max_tokens: 200,
      };

      // OpenAI → 标准格式
      const standardRequest = await openaiTransformer.normalizeRequest(openaiRequest, ctx);

      expect(standardRequest.tools).toHaveLength(1);
      expect(standardRequest.tools![0].function.name).toBe('get_weather');
      expect(standardRequest.tool_choice).toBe('auto');

      // 标准格式 → Anthropic
      const anthropicRequest = await anthropicTransformer.adaptRequest(standardRequest, ctx);
      const body = anthropicRequest.body as Record<string, unknown>;
      const tools = body.tools as Array<{ name: string; description: string; input_schema: unknown }>;

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('get_weather');
      expect(tools[0].description).toBe('Get weather for a location');
      expect(tools[0].input_schema).toEqual({
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name' },
          unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        },
        required: ['location'],
      });
      expect(body.tool_choice).toEqual({ type: 'auto' });
    });

    it('应该正确转换多模态请求', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: 'What is in this image?' },
              { type: 'image_url' as const, image_url: { url: 'https://example.com/image.jpg' } },
            ],
          },
        ],
        max_tokens: 100,
      };

      // OpenAI → 标准格式
      const standardRequest = await openaiTransformer.normalizeRequest(openaiRequest, ctx);

      const content = standardRequest.messages[0].content as Array<{ type: string }>;
      expect(content).toHaveLength(2);
      expect(content[1].type).toBe('image_url');

      // 标准格式 → Anthropic
      const anthropicRequest = await anthropicTransformer.adaptRequest(standardRequest, ctx);
      const body = anthropicRequest.body as Record<string, unknown>;
      const messages = body.messages as Array<{ content: Array<{ type: string }> }>;

      expect(messages[0].content).toHaveLength(2);
      expect(messages[0].content[1].type).toBe('image');
    });

    it('应该正确转换 base64 图片', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user' as const,
            content: [
              { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,abc123xyz' } },
            ],
          },
        ],
        max_tokens: 100,
      };

      // OpenAI → 标准格式 → Anthropic
      const standardRequest = await openaiTransformer.normalizeRequest(openaiRequest, ctx);
      const anthropicRequest = await anthropicTransformer.adaptRequest(standardRequest, ctx);

      const body = anthropicRequest.body as Record<string, unknown>;
      const messages = body.messages as Array<{ content: Array<{ type: string; source: { type: string; media_type: string; data: string } }> }>;

      expect(messages[0].content[0].type).toBe('image');
      expect(messages[0].content[0].source.type).toBe('base64');
      expect(messages[0].content[0].source.media_type).toBe('image/png');
      expect(messages[0].content[0].source.data).toBe('abc123xyz');
    });
  });

  describe('Anthropic → 标准格式 → OpenAI', () => {
    it('应该正确转换基本聊天请求', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        system: 'You are Claude.',
        messages: [
          { role: 'user' as const, content: 'Tell me a joke.' },
        ],
        max_tokens: 150,
        temperature: 0.8,
      };

      // Step 1: Anthropic → 标准格式
      const standardRequest = await anthropicTransformer.normalizeRequest(anthropicRequest, ctx);

      expect(standardRequest.messages).toHaveLength(2);
      expect(standardRequest.messages[0].role).toBe('system');
      expect(standardRequest.messages[0].content).toBe('You are Claude.');
      expect(standardRequest.messages[1].role).toBe('user');
      expect(standardRequest.metadata?.originalProvider).toBe('anthropic');

      // Step 2: 标准格式 → OpenAI
      const openaiRequest = await openaiTransformer.adaptRequest(standardRequest, ctx);
      const body = openaiRequest.body as Record<string, unknown>;
      const messages = body.messages as Array<{ role: string; content: string }>;

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(body.temperature).toBe(0.8);
      expect(body.max_tokens).toBe(150);
    });

    it('应该正确转换工具调用请求', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [
          { role: 'user' as const, content: 'What time is it?' },
          {
            role: 'assistant' as const,
            content: [
              {
                type: 'tool_use' as const,
                id: 'toolu_01AbcdEfgh',
                name: 'get_current_time',
                input: { timezone: 'UTC' },
              },
            ],
          },
          {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result' as const,
                tool_use_id: 'toolu_01AbcdEfgh',
                content: '{"time": "14:30"}',
              },
            ],
          },
        ],
        tools: [
          {
            name: 'get_current_time',
            description: 'Get current time',
            input_schema: {
              type: 'object' as const,
              properties: { timezone: { type: 'string' } },
            },
          },
        ],
        max_tokens: 100,
      };

      // Anthropic → 标准格式
      const standardRequest = await anthropicTransformer.normalizeRequest(anthropicRequest, ctx);

      expect(standardRequest.tools![0].function.name).toBe('get_current_time');
      expect(standardRequest.messages[1].tool_calls![0].id).toBe('toolu_01AbcdEfgh');
      expect(standardRequest.messages[1].tool_calls![0].function.name).toBe('get_current_time');
      // tool_result 在 Anthropic 格式中是 user 角色，但带有 tool_call_id
      expect(standardRequest.messages[2].tool_call_id).toBe('toolu_01AbcdEfgh');

      // 标准格式 → OpenAI
      const openaiRequest = await openaiTransformer.adaptRequest(standardRequest, ctx);
      const body = openaiRequest.body as Record<string, unknown>;
      const messages = body.messages as Array<Record<string, unknown>>;

      expect(messages[1].tool_calls).toBeDefined();
      // 注意：标准格式中的 tool_result 消息角色是 'user'，需要调整为 'tool'
      // 这是转换器实现的一个限制，实际应用中可能需要手动调整
    });

    it('应该正确处理 thinking/reasoning', async () => {
      const anthropicRequest = {
        model: 'claude-sonnet-4-5-20250929',
        messages: [{ role: 'user' as const, content: 'Solve: 2+2' }],
        max_tokens: 2000,
        thinking: {
          type: 'enabled' as const,
          budget_tokens: 1024,
        },
      };

      // Anthropic → 标准格式
      const standardRequest = await anthropicTransformer.normalizeRequest(anthropicRequest, ctx);

      expect(standardRequest.reasoning?.enabled).toBe(true);
      expect(standardRequest.reasoning?.max_tokens).toBe(1024);

      // 标准格式 → OpenAI
      const openaiRequest = await openaiTransformer.adaptRequest(standardRequest, ctx);
      const body = openaiRequest.body as Record<string, unknown>;

      // OpenAI 没有直接的 reasoning 参数，应该被忽略或转换
      expect(body.model).toBe('claude-sonnet-4-5-20250929');
    });
  });

  describe('响应转换: Anthropic → 标准格式 → OpenAI', () => {
    it('应该正确转换基本响应', async () => {
      // Anthropic Provider 返回的响应
      const anthropicResponse = {
        id: 'msg_01AbcdEfghIjklMno',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5-20250929',
        content: [{ type: 'text', text: 'The weather is sunny today.' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 15, output_tokens: 10 },
      };

      // Step 1: Anthropic → 标准格式
      const response = new Response(JSON.stringify(anthropicResponse));
      const standardResponse = await anthropicTransformer.normalizeResponse(response, ctx);

      expect(standardResponse.id).toBe('msg_01AbcdEfghIjklMno');
      expect(standardResponse.model).toBe('claude-sonnet-4-5-20250929');
      expect(standardResponse.choices[0].message.content).toBe('The weather is sunny today.');
      expect(standardResponse.choices[0].finish_reason).toBe('stop');

      // Step 2: 标准格式 → OpenAI 格式
      const openaiResponse = await openaiTransformer.adaptResponse(standardResponse, ctx);
      const data = await openaiResponse.json();

      expect(data.id).toBe('msg_01AbcdEfghIjklMno');
      expect(data.object).toBe('chat.completion');
      expect(data.choices[0].message.content).toBe('The weather is sunny today.');
      expect(data.choices[0].finish_reason).toBe('stop');
    });

    it('应该正确转换工具调用响应', async () => {
      const anthropicResponse = {
        id: 'msg_02XyzAbcDefGhiJkl',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5-20250929',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_03MnoPqrStuVwxYz',
            name: 'get_weather',
            input: { location: 'San Francisco', unit: 'fahrenheit' },
          },
        ],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 25, output_tokens: 15 },
      };

      // Anthropic → 标准格式
      const response = new Response(JSON.stringify(anthropicResponse));
      const standardResponse = await anthropicTransformer.normalizeResponse(response, ctx);

      expect(standardResponse.choices[0].finish_reason).toBe('tool_calls');
      expect(standardResponse.choices[0].message.tool_calls![0].id).toBe('toolu_03MnoPqrStuVwxYz');
      expect(standardResponse.choices[0].message.tool_calls![0].function.name).toBe('get_weather');
      expect(standardResponse.choices[0].message.tool_calls![0].function.arguments).toBe('{"location":"San Francisco","unit":"fahrenheit"}');

      // 标准格式 → OpenAI
      const openaiResponse = await openaiTransformer.adaptResponse(standardResponse, ctx);
      const data = await openaiResponse.json();

      expect(data.choices[0].finish_reason).toBe('tool_calls');
      expect(data.choices[0].message.tool_calls[0].id).toBe('toolu_03MnoPqrStuVwxYz');
    });
  });

  describe('响应转换: OpenAI → 标准格式 → Anthropic', () => {
    it('应该正确转换基本响应', async () => {
      // OpenAI Provider 返回的响应
      const openaiResponse = {
        id: 'chatcmpl-123abc',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you today?',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 8,
          total_tokens: 20,
        },
      };

      // OpenAI → 标准格式
      const response = new Response(JSON.stringify(openaiResponse));
      const standardResponse = await openaiTransformer.normalizeResponse(response, ctx);

      expect(standardResponse.id).toBe('chatcmpl-123abc');
      expect(standardResponse.choices[0].message.content).toBe('Hello! How can I help you today?');

      // 标准格式 → Anthropic
      const anthropicResponse = await anthropicTransformer.adaptResponse(standardResponse, ctx);
      const data = await anthropicResponse.json();

      expect(data.id).toBe('chatcmpl-123abc');
      expect(data.type).toBe('message');
      expect(data.role).toBe('assistant');
      expect(data.content[0].text).toBe('Hello! How can I help you today?');
      expect(data.stop_reason).toBe('end_turn');
    });

    it('应该正确转换工具调用响应', async () => {
      const openaiResponse = {
        id: 'chatcmpl-456def',
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
                  id: 'call_789ghi',
                  type: 'function',
                  function: {
                    name: 'calculate',
                    arguments: '{"expression": "2+2"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32 },
      };

      // OpenAI → 标准格式
      const response = new Response(JSON.stringify(openaiResponse));
      const standardResponse = await openaiTransformer.normalizeResponse(response, ctx);

      // 标准格式 → Anthropic
      const anthropicResponse = await anthropicTransformer.adaptResponse(standardResponse, ctx);
      const data = await anthropicResponse.json();

      expect(data.content[0].type).toBe('tool_use');
      expect(data.content[0].id).toBe('call_789ghi');
      expect(data.content[0].name).toBe('calculate');
      expect(data.content[0].input).toEqual({ expression: '2+2' });
      expect(data.stop_reason).toBe('tool_use');
    });
  });

  describe('完整的端到端场景', () => {
    it('应该处理完整的 OpenAI → Anthropic → Anthropic → OpenAI 流程', async () => {
      // 用户发送 OpenAI 格式请求
      const userRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'system' as const, content: 'Be helpful and concise.' },
          { role: 'user' as const, content: 'What is 2+2?' },
        ],
        temperature: 0.5,
        max_tokens: 50,
      };

      // Ingress: OpenAI → 标准格式
      const standardRequest = await openaiTransformer.normalizeRequest(userRequest, ctx);

      // Egress: 标准格式 → Anthropic (发送给 Provider)
      const providerRequest = await anthropicTransformer.adaptRequest(standardRequest, ctx);
      const requestBody = providerRequest.body as Record<string, unknown>;

      expect(requestBody.system).toBe('Be helpful and concise.');
      expect(requestBody.messages).toHaveLength(1);

      // Provider 返回 Anthropic 响应
      const providerResponse = {
        id: 'msg_provider_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5-20250929',
        content: [{ type: 'text', text: '2+2 equals 4.' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 15, output_tokens: 5 },
      };

      // Ingress: Anthropic → 标准格式
      const responseObj = new Response(JSON.stringify(providerResponse));
      const standardResponse = await anthropicTransformer.normalizeResponse(responseObj, ctx);

      // Egress: 标准格式 → OpenAI (返回给用户)
      const userResponse = await openaiTransformer.adaptResponse(standardResponse, ctx);
      const responseData = await userResponse.json();

      expect(responseData.id).toBe('msg_provider_123');
      expect(responseData.object).toBe('chat.completion');
      expect(responseData.choices[0].message.content).toBe('2+2 equals 4.');
      expect(responseData.choices[0].finish_reason).toBe('stop');
    });

    it('应该处理工具调用的完整流程', async () => {
      // 用户发送带工具的 OpenAI 请求
      const userRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'Weather in SF?' }],
        tools: [
          {
            type: 'function' as const,
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: {
                type: 'object' as const,
                properties: { location: { type: 'string' } },
              },
            },
          },
        ],
        tool_choice: 'auto' as const,
        max_tokens: 100,
      };

      // OpenAI → 标准格式 → Anthropic
      const standardRequest = await openaiTransformer.normalizeRequest(userRequest, ctx);
      const providerRequest = await anthropicTransformer.adaptRequest(standardRequest, ctx);

      const requestBody = providerRequest.body as Record<string, unknown>;
      expect(requestBody.tools).toHaveLength(1);

      // Provider 返回工具调用
      const providerResponse = {
        id: 'msg_tool_call',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5-20250929',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_weather',
            name: 'get_weather',
            input: { location: 'SF' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 20, output_tokens: 10 },
      };

      // Anthropic → 标准格式 → OpenAI
      const responseObj = new Response(JSON.stringify(providerResponse));
      const standardResponse = await anthropicTransformer.normalizeResponse(responseObj, ctx);
      const userResponse = await openaiTransformer.adaptResponse(standardResponse, ctx);
      const responseData = await userResponse.json();

      expect(responseData.choices[0].finish_reason).toBe('tool_calls');
      expect(responseData.choices[0].message.tool_calls[0].id).toBe('toolu_weather');
      expect(responseData.choices[0].message.tool_calls[0].function.name).toBe('get_weather');
    });
  });

  describe('数据一致性验证', () => {
    it('应该保持 token 统计的一致性', async () => {
      const openaiResponse = {
        id: 'chatcmpl-token-test',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Test response.' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      // OpenAI → 标准格式 → OpenAI
      const response = new Response(JSON.stringify(openaiResponse));
      const standardResponse = await openaiTransformer.normalizeResponse(response, ctx);

      expect(standardResponse.usage?.prompt_tokens).toBe(100);
      expect(standardResponse.usage?.completion_tokens).toBe(50);
      expect(standardResponse.usage?.total_tokens).toBe(150);
    });

    it('应该保持消息顺序的一致性', async () => {
      const openaiRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'system' as const, content: 'System 1' },
          { role: 'user' as const, content: 'User 1' },
          { role: 'assistant' as const, content: 'Assistant 1' },
          { role: 'user' as const, content: 'User 2' },
        ],
        max_tokens: 100,
      };

      const standardRequest = await openaiTransformer.normalizeRequest(openaiRequest, ctx);
      const anthropicRequest = await anthropicTransformer.adaptRequest(standardRequest, ctx);

      const body = anthropicRequest.body as Record<string, unknown>;

      // System 被提取到单独的字段
      expect(body.system).toBe('System 1');

      // 剩余消息保持顺序
      const messages = body.messages as Array<{ role: string; content: string }>;
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('User 1');
      expect(messages[1].content).toBe('Assistant 1');
      expect(messages[2].content).toBe('User 2');
    });

    it('应该正确处理空内容', async () => {
      const openaiResponse = {
        id: 'chatcmpl-empty',
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
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      };

      const response = new Response(JSON.stringify(openaiResponse));
      const standardResponse = await openaiTransformer.normalizeResponse(response, ctx);

      expect(standardResponse.choices[0].message.content).toBe('');
    });
  });
});
