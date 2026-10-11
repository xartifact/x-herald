import logger from '../../lib/logger'

/**
 * 估算 Token 数量（简单实现）
 * 基于字符数的粗略估算：1 token ≈ 4 个字符（英文）或 1.5 个字符（中文）
 */
export function estimateTokens(text: string): number {
  if (!text) return 0

  // 检测是否包含中文
  const hasChinese = /[\u4e00-\u9fa5]/.test(text)

  if (hasChinese) {
    // 中文：约 1.5 字符 = 1 token
    return Math.ceil(text.length / 1.5)
  } else {
    // 英文：约 4 字符 = 1 token
    return Math.ceil(text.length / 4)
  }
}

/**
 * 从请求/响应中估算 Token 使用量
 */
export function estimateUsageFromContent(
  requestBody?: unknown,
  responseBody?: unknown,
): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0
  let outputTokens = 0

  try {
    // 估算输入 tokens
    if (requestBody && typeof requestBody === 'object') {
      const req = requestBody as Record<string, unknown>
      const messages = req.messages
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          if (!msg || typeof msg !== 'object') continue
          const content = (msg as Record<string, unknown>).content
          if (typeof content === 'string') {
            inputTokens += estimateTokens(content)
          } else if (Array.isArray(content)) {
            for (const part of content) {
              if (
                part &&
                typeof part === 'object' &&
                (part as Record<string, unknown>).type === 'text'
              ) {
                const text = (part as Record<string, unknown>).text
                if (typeof text === 'string') inputTokens += estimateTokens(text)
              }
            }
          }
        }
      }
      // Responses API：instructions + input 数组（string 或 input_text 分块）
      if (req.input !== undefined) {
        const instructions = req.instructions
        if (typeof instructions === 'string') inputTokens += estimateTokens(instructions)
        if (typeof req.input === 'string') {
          inputTokens += estimateTokens(req.input)
        } else if (Array.isArray(req.input)) {
          for (const item of req.input) {
            if (typeof item === 'string') {
              inputTokens += estimateTokens(item)
            } else if (item && typeof item === 'object') {
              const rec = item as Record<string, unknown>
              if (typeof rec.text === 'string') inputTokens += estimateTokens(rec.text)
              if (Array.isArray(rec.content)) {
                for (const part of rec.content) {
                  if (
                    part &&
                    typeof part === 'object' &&
                    (part as Record<string, unknown>).type === 'input_text'
                  ) {
                    const text = (part as Record<string, unknown>).text
                    inputTokens += estimateTokens(typeof text === 'string' ? text : '')
                  }
                }
              }
            }
          }
        }
      }
    }

    // 估算输出 tokens
    if (responseBody && typeof responseBody === 'object') {
      const res = responseBody as Record<string, unknown>

      // Phase 1: 处理流式响应摘要（使用完整内容）
      if (res.type === 'stream_summary') {
        // 新格式：thinkingContent + contentText
        const thinkingContent = res.thinkingContent
        const contentText = res.contentText
        const contentPreview = res.contentPreview
        if (typeof thinkingContent === 'string' || typeof contentText === 'string') {
          if (typeof thinkingContent === 'string') outputTokens += estimateTokens(thinkingContent)
          if (typeof contentText === 'string') outputTokens += estimateTokens(contentText)
        }
        // 后备：旧格式 contentPreview
        else if (typeof contentPreview === 'string') {
          outputTokens = estimateTokens(contentPreview)
        }
      }
      // 处理标准响应
      else if (res.choices && Array.isArray(res.choices)) {
        for (const choice of res.choices) {
          if (choice.message?.content) {
            outputTokens += estimateTokens(choice.message.content)
          }
        }
      }
      // 处理 Anthropic 响应
      else if (res.content && Array.isArray(res.content)) {
        for (const block of res.content) {
          if (
            block &&
            typeof block === 'object' &&
            (block as Record<string, unknown>).type === 'text'
          ) {
            const text = (block as Record<string, unknown>).text
            if (typeof text === 'string') outputTokens += estimateTokens(text)
          }
        }
      }
      // 处理 Responses API 响应：output 数组（message/output_text、function_call args）
      else if (res.object === 'response' && Array.isArray(res.output)) {
        for (const item of res.output) {
          if (!item || typeof item !== 'object') continue
          const rec = item as Record<string, unknown>
          if (typeof rec.args === 'string') outputTokens += estimateTokens(rec.args)
          if (Array.isArray(rec.content)) {
            for (const part of rec.content) {
              if (
                part &&
                typeof part === 'object' &&
                (part as Record<string, unknown>).type === 'output_text'
              ) {
                const text = (part as Record<string, unknown>).text
                if (typeof text === 'string') outputTokens += estimateTokens(text)
              }
            }
          }
        }
      }
    }

    logger.debug({ inputTokens, outputTokens }, 'Estimated token usage')
  } catch (error) {
    logger.error({ error }, 'Failed to estimate token usage')
  }

  return { inputTokens, outputTokens }
}
