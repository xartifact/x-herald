import { describe, it, expect } from 'bun:test';
import { estimateTokens, estimateUsageFromContent } from '../token-estimator';

describe('Token Estimator', () => {
  describe('estimateTokens', () => {
    it('应该为英文文本估算 token 数量', () => {
      const text = 'Hello, world!'; // 13 字符 ≈ 3.25 tokens → 4 tokens
      const tokens = estimateTokens(text);
      expect(tokens).toBe(4);
    });

    it('应该为中文文本估算 token 数量', () => {
      const text = '你好世界'; // 4 字符 ≈ 2.67 tokens → 3 tokens
      const tokens = estimateTokens(text);
      expect(tokens).toBe(3);
    });

    it('应该为混合中英文文本估算 token 数量（按中文规则）', () => {
      const text = '你好 Hello'; // 8 字符，包含中文 → 按中文规则 ≈ 5.33 → 6 tokens
      const tokens = estimateTokens(text);
      expect(tokens).toBe(6);
    });

    it('应该为空文本返回 0', () => {
      const tokens = estimateTokens('');
      expect(tokens).toBe(0);
    });
  });

  describe('estimateUsageFromContent', () => {
    it('应该从 OpenAI 格式的请求体中估算输入 token', () => {
      const requestBody = {
        messages: [
          { role: 'user', content: 'Hello, how are you?' }, // 19 字符 ≈ 5 tokens
        ],
      };

      const { inputTokens, outputTokens } = estimateUsageFromContent(requestBody);
      expect(inputTokens).toBe(5);
      expect(outputTokens).toBe(0);
    });

    it('应该从多消息请求中估算输入 token', () => {
      const requestBody = {
        messages: [
          { role: 'user', content: 'Hello' }, // 5 字符 ≈ 2 tokens
          { role: 'assistant', content: 'Hi there' }, // 8 字符 ≈ 2 tokens
          { role: 'user', content: 'How are you?' }, // 12 字符 ≈ 3 tokens
        ],
      };

      const { inputTokens } = estimateUsageFromContent(requestBody);
      expect(inputTokens).toBe(7); // 2 + 2 + 3
    });

    it('应该从内容数组中估算输入 token', () => {
      const requestBody = {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' }, // 5 字符 ≈ 2 tokens
              { type: 'text', text: 'World' }, // 5 字符 ≈ 2 tokens
            ],
          },
        ],
      };

      const { inputTokens } = estimateUsageFromContent(requestBody);
      expect(inputTokens).toBe(4); // 2 + 2
    });

    it('应该从流式响应摘要中估算输出 token', () => {
      const responseBody = {
        type: 'stream_summary',
        contentPreview: 'This is a test response', // 23 字符 ≈ 6 tokens
      };

      const { inputTokens, outputTokens } = estimateUsageFromContent(undefined, responseBody);
      expect(inputTokens).toBe(0);
      expect(outputTokens).toBe(6);
    });

    it('应该从标准响应中估算输出 token', () => {
      const responseBody = {
        choices: [
          {
            message: {
              content: 'Hello world', // 11 字符 ≈ 3 tokens
            },
          },
        ],
      };

      const { outputTokens } = estimateUsageFromContent(undefined, responseBody);
      expect(outputTokens).toBe(3);
    });

    it('应该从 Anthropic 响应中估算输出 token', () => {
      const responseBody = {
        content: [
          { type: 'text', text: 'Hello' }, // 5 字符 ≈ 2 tokens
          { type: 'text', text: 'World' }, // 5 字符 ≈ 2 tokens
        ],
      };

      const { outputTokens } = estimateUsageFromContent(undefined, responseBody);
      expect(outputTokens).toBe(4);
    });

    it('应该同时估算输入和输出 token', () => {
      const requestBody = {
        messages: [
          { role: 'user', content: 'Test' }, // 4 字符 ≈ 1 token
        ],
      };

      const responseBody = {
        type: 'stream_summary',
        contentPreview: 'Response', // 8 字符 ≈ 2 tokens
      };

      const { inputTokens, outputTokens } = estimateUsageFromContent(requestBody, responseBody);
      expect(inputTokens).toBe(1);
      expect(outputTokens).toBe(2);
    });

    it('应该处理空的请求/响应', () => {
      const { inputTokens, outputTokens } = estimateUsageFromContent();
      expect(inputTokens).toBe(0);
      expect(outputTokens).toBe(0);
    });
  });
});
