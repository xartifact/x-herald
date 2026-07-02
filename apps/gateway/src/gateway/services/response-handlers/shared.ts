import type { StreamProgress, StreamContent } from '../../../features/logs/db'

import { estimateTokens } from '../token-estimator'

/**
 * 提取 Provider 响应头信息（保留所有信息）
 */
export function extractProviderResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  return headers
}

/**
 * 透传 Provider 响应头（不过滤任何 header）
 */
function filterProviderHeaders(providerHeaders: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(providerHeaders)) {
    if (value && value.trim() !== '') {
      result[key] = value
    }
  }
  return result
}

/**
 * 合并响应头: Provider headers 全量透传，Gateway headers 覆盖同名项
 */
export function mergeResponseHeaders(
  gatewayHeaders: Record<string, string>,
  providerHeaders: Record<string, string>,
): Record<string, string> {
  return {
    ...filterProviderHeaders(providerHeaders),
    ...gatewayHeaders,
  }
}

/**
 * 将 SSE chunk 中的 model 字段替换为客户端原始请求的模型名
 * 支持 OpenAI 格式（顶层 model）和 Anthropic 格式（message_start.message.model）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function remapModelInChunk(json: any, targetModel: string): boolean {
  let modified = false
  if (json.model !== undefined) {
    json.model = targetModel
    modified = true
  }
  if (json.type === 'message_start' && json.message?.model !== undefined) {
    json.message.model = targetModel
    modified = true
  }
  return modified
}

/**
 * 创建 SSE 流的 model 回写 TransformStream
 * 将 provider 实际模型名替换回客户端请求的原始模型名
 */
export function createModelRemapStream(
  originalModelName: string,
): TransformStream<Uint8Array, Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  return new TransformStream({
    transform(chunk, controller) {
      const text = decoder.decode(chunk)
      const lines = text.split('\n')
      const remapped = lines.map((line) => {
        if (!line.startsWith('data:')) return line
        const data = line.slice(5).trim()
        if (data === '[DONE]') return line
        try {
          const json = JSON.parse(data)
          if (remapModelInChunk(json, originalModelName)) {
            return `data: ${JSON.stringify(json)}`
          }
        } catch {
          // 解析失败，原样透传
        }
        return line
      })
      controller.enqueue(encoder.encode(remapped.join('\n')))
    },
  })
}

/**
 * 生成客户端响应头（非流式）
 */
export function getClientNonStreamingHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
  }
}

/**
 * 生成客户端响应头（流式）
 * 透明代理原则：不主动添加 provider 没有的 header
 * 若 provider 已返回 text/event-stream 类型，保留其完整值（含 charset 等参数）
 * 否则强制设为标准 SSE 类型（provider 未发 content-type 时的兜底）
 */
export function getClientStreamingHeaders(providerContentType?: string): Record<string, string> {
  const contentType = providerContentType?.startsWith('text/event-stream')
    ? providerContentType
    : 'text/event-stream'
  return {
    'content-type': contentType,
  }
}

/**
 * 流式响应摘要收集器（Phase 1 增强版）
 * 完整收集流式响应的所有数据用于日志记录
 */
export class StreamResponseCollector {
  private eventCount = 0
  private bytesReceived = 0

  // Phase 1: 完整内容存储（移除截断限制）
  private thinkingBlocks: string[] = []
  private contentChunks: string[] = []
  private allChunks: unknown[] = [] // 小规模：存储所有 chunks

  // 时间戳
  private firstChunkTime: number | null = null
  private lastChunkTime: number | null = null
  private firstThinkingChunkTime: number | null = null
  private firstTextChunkTime: number | null = null

  // 真实 usage（从流中提取）
  private realUsage: { prompt_tokens?: number; completion_tokens?: number } | null = null

  // Provider 响应中的模型名（从第一个包含 model 的 chunk 中提取）
  private providerModel: string | null = null

  // 保留原有字段
  private hasToolCalls = false
  private finishReason: string | null = null

  /**
   * 处理一个 SSE 事件
   */
  processEvent(data: string): void {
    this.eventCount++
    const now = Date.now()

    if (!this.firstChunkTime) {
      this.firstChunkTime = now
    }
    this.lastChunkTime = now

    try {
      const json = JSON.parse(data)

      // Phase 1: 存储所有原始 chunks（小规模完整存储）
      this.allChunks.push(json)

      // Anthropic: content_block_start with type=thinking 比 delta 更早到达，提前记录首帧时间
      if (
        !this.firstThinkingChunkTime &&
        json.type === 'content_block_start' &&
        (json.content_block as Record<string, unknown>)?.type === 'thinking'
      ) {
        this.firstThinkingChunkTime = now
      }

      // Phase 1: 提取完整 thinking content（无截断）
      const thinking = this.extractReasoning(json)
      if (thinking) {
        if (!this.firstThinkingChunkTime) this.firstThinkingChunkTime = now
        this.thinkingBlocks.push(thinking)
      }

      // Phase 1: 提取完整 content（无截断）
      const content = this.extractContent(json)
      if (content) {
        if (!this.firstTextChunkTime) this.firstTextChunkTime = now
        this.contentChunks.push(content)
      }

      // 提取 Provider 响应模型名（仅取第一次出现）
      // OpenAI: 顶层 json.model；Anthropic: message_start 事件中 json.message.model
      if (!this.providerModel) {
        if (typeof json.model === 'string') {
          this.providerModel = json.model
        } else if (
          json.type === 'message_start' &&
          typeof (json.message as Record<string, unknown>)?.model === 'string'
        ) {
          this.providerModel = (json.message as Record<string, unknown>).model as string
        }
      }

      // Phase 1: 提取真实 usage
      const usage = extractUsageFromChunk(data)
      if (usage) {
        if (!this.realUsage) {
          this.realUsage = {}
        }
        if (usage.prompt_tokens !== undefined) {
          this.realUsage.prompt_tokens = usage.prompt_tokens
        }
        if (usage.completion_tokens !== undefined) {
          this.realUsage.completion_tokens = usage.completion_tokens
        }
      }

      this.bytesReceived += data.length

      // 检测工具调用
      if (
        json.choices?.[0]?.delta?.tool_calls ||
        (json.type === 'content_block_start' && json.content_block?.type === 'tool_use')
      ) {
        this.hasToolCalls = true
      }

      // 记录结束原因
      if (json.choices?.[0]?.finish_reason) {
        this.finishReason = json.choices[0].finish_reason
      } else if (json.delta?.stop_reason) {
        this.finishReason = json.delta.stop_reason
      }
    } catch {
      // 解析失败，忽略
    }
  }

  /**
   * 从事件中提取文本内容
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractContent(json: any): string | null {
    let content: string | null = null

    // OpenAI 格式
    if (json.choices?.[0]?.delta?.content) {
      content = json.choices[0].delta.content
    }
    // Anthropic 格式
    else if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      content = json.delta.text
    }

    return content
  }

  /**
   * 从事件中提取推理内容
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractReasoning(json: any): string | null {
    // OpenAI: reasoning_content（阿里云百炼、DeepSeek 等）
    if (json.choices?.[0]?.delta?.reasoning_content) {
      return json.choices[0].delta.reasoning_content
    }
    // OpenAI 变体：delta.reasoning（部分厂商使用不同字段名）
    if (json.choices?.[0]?.delta?.reasoning) {
      return json.choices[0].delta.reasoning
    }
    // Anthropic: thinking_delta / thinking
    if (json.type === 'content_block_delta') {
      if (json.delta?.type === 'thinking_delta' || json.delta?.type === 'thinking') {
        return json.delta.thinking || null
      }
      // Anthropic: redacted thinking（已思考但内容被隐藏，data 为 base64 编码）
      if (json.delta?.type === 'redacted_thinking_delta') {
        return (json.delta.data as string) ?? '<redacted>'
      }
    }
    return null
  }

  /**
   * 获取首 token 时间戳（绝对时间）
   */
  getFirstChunkTimes(): {
    firstThinkingChunkTime: number | null
    firstTextChunkTime: number | null
  } {
    return {
      firstThinkingChunkTime: this.firstThinkingChunkTime,
      firstTextChunkTime: this.firstTextChunkTime,
    }
  }

  /**
   * Phase 1 新增：获取当前进度
   */
  getProgress(): StreamProgress {
    return {
      chunksProcessed: this.eventCount,
      bytesReceived: this.bytesReceived,
      lastChunkAt: this.lastChunkTime || Date.now(),
    }
  }

  /**
   * Phase 1 新增：获取完整内容
   */
  getFullContent(): StreamContent {
    return {
      thinkingBlocks: this.thinkingBlocks,
      contentChunks: this.contentChunks,
      allChunks: this.allChunks,
    }
  }

  /**
   * Phase 1 新增：获取真实 usage 或基于完整内容的估算
   */
  getUsage(): { inputTokens: number; outputTokens: number; estimated: boolean } {
    // 只要有任意一个真实 usage 数据，就视为非完全估算
    const hasRealInput = this.realUsage?.prompt_tokens !== undefined
    const hasRealOutput = this.realUsage?.completion_tokens !== undefined

    if (hasRealInput || hasRealOutput) {
      // 回退：基于完整内容估算缺失的部分
      const fullContent = this.contentChunks.join('')
      const fullThinking = this.thinkingBlocks.join('')
      const estimatedOutput = estimateTokens(fullContent) + estimateTokens(fullThinking)

      return {
        inputTokens: this.realUsage?.prompt_tokens ?? 0,
        outputTokens: this.realUsage?.completion_tokens ?? estimatedOutput,
        estimated: !hasRealOutput, // 如果 output tokens 是估算的，标记为 estimated
      }
    }

    // 完全没有真实 usage 数据，完全基于内容估算
    const fullContent = this.contentChunks.join('')
    const fullThinking = this.thinkingBlocks.join('')

    const estimatedOutput = estimateTokens(fullContent)
    const estimatedThinking = estimateTokens(fullThinking)

    return {
      inputTokens: 0,
      outputTokens: estimatedOutput + estimatedThinking,
      estimated: true,
    }
  }

  /**
   * 生成响应摘要（Phase 1 修改：返回完整内容而非预览）
   */
  getSummary(protocol: string): unknown {
    return {
      type: 'stream_summary',
      protocol,
      eventCount: this.eventCount,
      // Phase 1: 完整内容（非截断预览）
      thinkingContent: this.thinkingBlocks.join(''),
      contentText: this.contentChunks.join(''),
      bytesReceived: this.bytesReceived,
      hasToolCalls: this.hasToolCalls,
      finishReason: this.finishReason,
      ...(this.providerModel && { model: this.providerModel }),
    }
  }

  getProviderModel(): string | null {
    return this.providerModel
  }
}

/**
 * 从 SSE chunk 中提取 usage 信息
 * 优先从标准 StreamChunk 提取（转换后的流），后备支持原始 Provider 格式
 */
export function extractUsageFromChunk(
  data: string,
): { prompt_tokens?: number; completion_tokens?: number } | null {
  try {
    const json = JSON.parse(data)

    // 优先：标准 StreamChunk 格式（转换后的流）
    if (json.object === 'chat.completion.chunk' && json.usage) {
      return {
        prompt_tokens: json.usage.prompt_tokens,
        completion_tokens: json.usage.completion_tokens,
      }
    }

    // 后备：OpenAI 原始格式（同协议场景）
    if (json.usage && json.choices) {
      return {
        prompt_tokens: json.usage.prompt_tokens,
        completion_tokens: json.usage.completion_tokens,
      }
    }

    // 后备：Anthropic 原始格式 - message_delta 事件中的 usage
    if (json.type === 'message_delta' && json.usage) {
      return {
        prompt_tokens: json.usage.input_tokens,
        completion_tokens: json.usage.output_tokens,
      }
    }

    // 后备：Anthropic 原始格式 - message_start 事件中的 usage (input tokens)
    if (json.type === 'message_start' && json.message?.usage) {
      return {
        prompt_tokens: json.message.usage.input_tokens,
        completion_tokens: json.message.usage.output_tokens,
      }
    }

    // 调试日志：仅在需要时记录未提取到 usage 的事件类型
    // 已移除：高频 debug 日志，减少日志噪音
  } catch (error) {
    // 解析失败，静默处理以避免影响性能
    // 已移除：高频 debug 日志，减少日志噪音
  }
  return null
}
