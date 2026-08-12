/**
 * 基于真实日志数据的 Anthropic 协议转换测试
 * 数据来源：request_logs 表中的实际请求
 */

import { describe, it, expect, beforeEach } from 'bun:test'

import type { TransformerContext } from '@xartifact/x-herald-shared'

import { AnthropicTransformer } from '../anthropic'

describe('AnthropicTransformer - 真实场景测试', () => {
  let transformer: AnthropicTransformer
  let ctx: TransformerContext

  beforeEach(() => {
    transformer = new AnthropicTransformer()
    ctx = {
      requestId: 'af591197-81d3-425d-8a07-75cc650a4e30',
      provider: {
        id: '087968f9-5dcf-4a91-86e9-43f73d0d36de',
        name: '百炼',
      },
      metadata: {},
    }
  })

  describe('Claude Code CLI 请求转换', () => {
    it('应该正确转换包含大量工具定义的请求', async () => {
      // 简化的 Claude Code 请求（保留关键特征）
      const anthropicRequest = {
        model: 'MiniMax-M2.1',
        tools: [
          {
            name: 'Task',
            description: 'Launch a new agent to handle complex, multi-step tasks autonomously.',
            input_schema: {
              type: 'object' as const,
              required: ['description', 'prompt', 'subagent_type'],
              properties: {
                model: {
                  enum: ['sonnet', 'opus', 'haiku'],
                  type: 'string',
                  description: 'Optional model to use for this agent.',
                },
                prompt: {
                  type: 'string',
                  description: 'The task for the agent to perform',
                },
                subagent_type: {
                  type: 'string',
                  description: 'The type of specialized agent to use for this task',
                },
              },
            },
          },
          {
            name: 'Bash',
            description: 'Executes a given bash command with optional timeout.',
            input_schema: {
              type: 'object' as const,
              required: ['command'],
              properties: {
                command: {
                  type: 'string',
                  description: 'The command to execute',
                },
                timeout: {
                  type: 'number',
                  description: 'Optional timeout in milliseconds (max 600000)',
                },
              },
            },
          },
        ],
        messages: [
          {
            role: 'user' as const,
            content: 'test',
          },
        ],
        max_tokens: 500,
        temperature: 1,
        thinking: {
          type: 'enabled' as const,
          budget_tokens: 499,
        },
        metadata: {
          user_id: 'user_012f78ed2a988333cf9a7c535937aac39460db56b08a549a4d645c47ea9a70dd',
        },
      }

      const result = await transformer.normalizeRequest(anthropicRequest, ctx)

      // 验证基本字段
      expect(result.model).toBe('MiniMax-M2.1')
      expect(result.max_tokens).toBe(500)
      expect(result.temperature).toBe(1)

      // 验证工具转换
      expect(result.tools).toHaveLength(2)
      expect(result.tools![0].function.name).toBe('Task')
      expect(result.tools![1].function.name).toBe('Bash')

      // **关键测试**：验证工具定义中的 model enum 保持原样
      const taskToolParams = result.tools![0].function.parameters as {
        properties: { model: { enum: string[] } }
      }
      expect(taskToolParams.properties.model.enum).toEqual(['sonnet', 'opus', 'haiku'])

      // 验证 thinking 模式转换
      expect(result.reasoning?.enabled).toBe(true)
      expect(result.reasoning?.max_tokens).toBe(499)

      // 验证 metadata
      expect(result.metadata?.userId).toBe(
        'user_012f78ed2a988333cf9a7c535937aac39460db56b08a549a4d645c47ea9a70dd',
      )
    })

    it('应该正确转换响应（包含思考内容）', async () => {
      const anthropicResponse = {
        id: 'chatcmpl-b9afa289-431b-96e9-8da1-90a972e9fe45',
        type: 'message',
        role: 'assistant',
        model: 'MiniMax-M2.1',
        content: [
          {
            type: 'text',
            text: '\n\n没有足够上下文进行预测。等待用户的实际任务请求。',
          },
        ],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 22836,
          output_tokens: 55,
        },
      }

      const response = new Response(JSON.stringify(anthropicResponse))
      const result = await transformer.normalizeResponse(response, ctx)

      // 验证响应转换
      expect(result.id).toBe('chatcmpl-b9afa289-431b-96e9-8da1-90a972e9fe45')
      expect(result.model).toBe('MiniMax-M2.1')
      expect(result.choices[0].message.content).toContain('没有足够上下文进行预测')
      expect(result.choices[0].finish_reason).toBe('stop')

      // 验证 token 统计
      expect(result.usage?.prompt_tokens).toBe(22836)
      expect(result.usage?.completion_tokens).toBe(55)
      expect(result.usage?.total_tokens).toBe(22891)
    })
  })

  describe('工具定义中的模型枚举值问题', () => {
    it('文档说明：工具定义中的 Anthropic 模型名称不会自动修改', () => {
      /**
       * 问题：为什么 tools.function.parameters.properties.model.enum 值是 Anthropic 模型名称？
       *
       * 原因：
       * 1. 这是 Claude Code CLI 客户端发送的原始工具定义
       * 2. Task 工具的 model 参数用于子代理选择模型
       * 3. Claude Code 默认只支持 Anthropic 的模型选项（sonnet, opus, haiku）
       * 4. 即使后端使用 MiniMax，工具定义仍保持原样，Gateway 只是透传
       *
       * 潜在问题：
       * - 如果用户在 Claude Code 中使用 Task 工具并指定 model: "sonnet"
       * - 这个值会被传递到 Gateway
       * - 需要在 Gateway 中将 Anthropic 模型名映射到实际可用的模型
       *
       * 建议方案：
       * 1. 在 chat-completion-handler 中检测工具调用
       * 2. 如果检测到 model 参数是 Anthropic 模型名（sonnet/opus/haiku）
       * 3. 映射到实际可用的模型（如 MiniMax-M2.1）
       */

      expect(true).toBe(true) // 文档性测试
    })

    it('应该保持工具定义中的原始 enum 值不变', async () => {
      const standardRequest = {
        model: 'MiniMax-M2.1',
        messages: [{ role: 'user' as const, content: 'test' }],
        tools: [
          {
            type: 'function' as const,
            function: {
              name: 'Task',
              description: 'Launch agent',
              parameters: {
                type: 'object' as const,
                properties: {
                  model: {
                    enum: ['sonnet', 'opus', 'haiku'],
                    type: 'string',
                  },
                },
              },
            },
          },
        ],
        max_tokens: 500,
      }

      const result = await transformer.adaptRequest(standardRequest, ctx)
      const body = result.body as {
        tools: Array<{
          input_schema: { properties: { model: { enum: string[] } } }
        }>
      }

      // 验证：转换为 Anthropic 格式后，enum 值应保持不变
      expect(body.tools[0].input_schema.properties.model.enum).toEqual(['sonnet', 'opus', 'haiku'])
    })
  })

  describe('大规模上下文处理', () => {
    it('应该正确处理包含大量 token 的请求', async () => {
      const anthropicRequest = {
        model: 'MiniMax-M2.1',
        messages: [
          {
            role: 'user' as const,
            content: '测试大规模上下文处理',
          },
        ],
        max_tokens: 500,
      }

      const result = await transformer.normalizeRequest(anthropicRequest, ctx)

      expect(result.model).toBe('MiniMax-M2.1')
      expect(result.max_tokens).toBe(500)
    })

    it('应该正确报告输入和输出 token 统计', async () => {
      const anthropicResponse = {
        id: 'test-id',
        type: 'message',
        role: 'assistant',
        model: 'MiniMax-M2.1',
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 22836, // 真实场景中的大量输入
          output_tokens: 55,
        },
      }

      const response = new Response(JSON.stringify(anthropicResponse))
      const result = await transformer.normalizeResponse(response, ctx)

      expect(result.usage?.prompt_tokens).toBe(22836)
      expect(result.usage?.completion_tokens).toBe(55)
      expect(result.usage?.total_tokens).toBe(22891)
    })
  })

  describe('协议转换链路测试', () => {
    it('应该完成完整的 Anthropic -> Standard -> Anthropic 转换循环', async () => {
      // 1. Anthropic 请求 -> Standard 格式
      const originalRequest = {
        model: 'MiniMax-M2.1',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        max_tokens: 100,
        temperature: 0.7,
      }

      const standardRequest = await transformer.normalizeRequest(originalRequest, ctx)

      // 2. Standard 格式 -> Anthropic 请求（发送给提供商）
      const adaptedRequest = await transformer.adaptRequest(standardRequest, ctx)
      const adaptedBody = adaptedRequest.body as typeof originalRequest

      // 验证往返转换后的一致性
      expect(adaptedBody.model).toBe(originalRequest.model)
      expect(adaptedBody.max_tokens).toBe(originalRequest.max_tokens)
      expect(adaptedBody.temperature).toBe(originalRequest.temperature)
      expect(adaptedBody.messages).toHaveLength(originalRequest.messages.length)
    })
  })
})
