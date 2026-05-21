import { logger } from '@x-llm-gateway/engine';

/**
 * 估算 Token 数量（简单实现）
 * 基于字符数的粗略估算：1 token ≈ 4 个字符（英文）或 1.5 个字符（中文）
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // 检测是否包含中文
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);

  if (hasChinese) {
    // 中文：约 1.5 字符 = 1 token
    return Math.ceil(text.length / 1.5);
  } else {
    // 英文：约 4 字符 = 1 token
    return Math.ceil(text.length / 4);
  }
}

/**
 * 从请求/响应中估算 Token 使用量
 */
export function estimateUsageFromContent(
  requestBody?: unknown,
  responseBody?: unknown
): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    // 估算输入 tokens
    if (requestBody && typeof requestBody === 'object') {
      const req = requestBody as any;
      if (req.messages && Array.isArray(req.messages)) {
        for (const msg of req.messages) {
          if (typeof msg.content === 'string') {
            inputTokens += estimateTokens(msg.content);
          } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === 'text' && part.text) {
                inputTokens += estimateTokens(part.text);
              }
            }
          }
        }
      }
    }

    // 估算输出 tokens
    if (responseBody && typeof responseBody === 'object') {
      const res = responseBody as any;

      // Phase 1: 处理流式响应摘要（使用完整内容）
      if (res.type === 'stream_summary') {
        // 新格式：thinkingContent + contentText
        if (res.thinkingContent || res.contentText) {
          outputTokens += estimateTokens(res.thinkingContent || '');
          outputTokens += estimateTokens(res.contentText || '');
        }
        // 后备：旧格式 contentPreview
        else if (res.contentPreview) {
          outputTokens = estimateTokens(res.contentPreview);
        }
      }
      // 处理标准响应
      else if (res.choices && Array.isArray(res.choices)) {
        for (const choice of res.choices) {
          if (choice.message?.content) {
            outputTokens += estimateTokens(choice.message.content);
          }
        }
      }
      // 处理 Anthropic 响应
      else if (res.content && Array.isArray(res.content)) {
        for (const block of res.content) {
          if (block.type === 'text' && block.text) {
            outputTokens += estimateTokens(block.text);
          }
        }
      }
    }

    logger.debug({ inputTokens, outputTokens }, 'Estimated token usage');
  } catch (error) {
    logger.error({ error }, 'Failed to estimate token usage');
  }

  return { inputTokens, outputTokens };
}
