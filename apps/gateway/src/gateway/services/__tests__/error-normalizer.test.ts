import { describe, it, expect } from 'bun:test'

const { normalizeProviderErrorMessage } = await import('../error-handler?v=1')

describe('normalizeProviderErrorMessage', () => {
  describe('消息体超 Provider 限制', () => {
    it('应解析字节数并转换为 MB', () => {
      const raw = 'total message size 10852702 exceeds limit 2097152'
      const result = normalizeProviderErrorMessage(raw)
      expect(result.code).toBe('context_length_exceeded')
      expect(result.message).toContain('10.3 MB')
      expect(result.message).toContain('2.0 MB')
    })

    it('应处理不同大小的字节数', () => {
      const raw = 'total message size 5461790 exceeds limit 2097152'
      const result = normalizeProviderErrorMessage(raw)
      expect(result.code).toBe('context_length_exceeded')
      expect(result.message).toContain('5.2 MB')
    })
  })

  describe('Provider 服务连接失败', () => {
    it('应识别 Cannot connect to host 错误', () => {
      const raw =
        '聊天请求失败: Cannot connect to host 10.86.0.141:8131 ssl:default [Connect call failed]'
      const result = normalizeProviderErrorMessage(raw)
      expect(result.code).toBe('provider_service_unavailable')
      expect(result.message).toContain('unavailable')
    })
  })

  describe('请求体超网关限制', () => {
    it('应解析限制大小并转换为 MB', () => {
      const raw = 'Exceeded limit on max bytes to request body : 6291456'
      const result = normalizeProviderErrorMessage(raw)
      expect(result.code).toBe('request_too_large')
      expect(result.message).toContain('6.0 MB')
    })
  })

  describe('Tool call 格式错误', () => {
    it('应识别 tool_call 格式错误', () => {
      const raw =
        "an assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'. The following tool_call_ids did not have response messages: Skill:13"
      const result = normalizeProviderErrorMessage(raw)
      expect(result.code).toBe('invalid_tool_call_format')
      expect(result.message).toContain('tool_call')
    })
  })

  describe('未识别错误（兜底）', () => {
    it('应返回原始消息和通用 code', () => {
      const raw = 'Some unknown provider error message'
      const result = normalizeProviderErrorMessage(raw)
      expect(result.code).toBe('provider_error')
      expect(result.message).toBe(raw)
    })

    it('应处理空字符串', () => {
      const result = normalizeProviderErrorMessage('')
      expect(result.code).toBe('provider_error')
      expect(result.message).toBe('')
    })
  })
})

describe('真实错误消息回归测试', () => {
  const realErrors = [
    {
      raw: 'total message size 10852702 exceeds limit 2097152',
      expectedCode: 'context_length_exceeded',
    },
    {
      raw: 'total message size 8135482 exceeds limit 2097152',
      expectedCode: 'context_length_exceeded',
    },
    {
      raw: '{"code":500,"message":"聊天请求失败: Cannot connect to host 10.86.0.141:8131 ssl:default [Connect call failed (\'10.86.0.141\', 8131)]","data":{}}',
      expectedCode: 'provider_service_unavailable',
    },
    {
      raw: 'Exceeded limit on max bytes to request body : 6291456',
      expectedCode: 'request_too_large',
    },
    {
      raw: "an assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'. The following tool_call_ids did not have response messages: Skill:13",
      expectedCode: 'invalid_tool_call_format',
    },
    {
      raw: 'Provider request failed',
      expectedCode: 'provider_error',
    },
  ]

  for (const { raw, expectedCode } of realErrors) {
    it(`应正确处理: "${raw.slice(0, 50)}..."`, () => {
      const result = normalizeProviderErrorMessage(raw)
      expect(result.code).toBe(expectedCode)
      expect(result.message.length).toBeGreaterThan(0)
    })
  }
})
