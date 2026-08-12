import type { Log } from '@xartifact/x-herald-shared'

// Content Features 数据结构
export interface ContentFeatures {
  request?: {
    messageCount: number
    roleDistribution: { user: number; assistant: number; system: number }
    avgMessageLength: number
    systemPromptLength?: number
  }
  response?: {
    blockCount: number
    typeDistribution: { text: number; toolUse: number; thinking: number }
    totalLength: number
  }
  tokens?: {
    inputOutputRatio: { input: number; output: number }
    tokensPerSecond: number
    tokensPerMessage: number
  }
  tools?: {
    pattern: string
    complexity: number
  }
  complexity?: {
    contextLevel: 'short' | 'medium' | 'long' | 'extra-long'
    contentDensity: number
  }
}

// 提取内容特征
export function extractContentFeatures(log: Log): ContentFeatures | null {
  try {
    const features: ContentFeatures = {}

    // 1. 请求内容统计
    if (log.requestBody?.messages && Array.isArray(log.requestBody.messages)) {
      const messages = log.requestBody.messages as Array<{ role: string; content: unknown }>
      const roleDistribution = { user: 0, assistant: 0, system: 0 }
      let totalLength = 0
      let systemPromptLength: number | undefined

      messages.forEach((msg) => {
        const role = msg.role as 'user' | 'assistant' | 'system'
        if (role in roleDistribution) {
          roleDistribution[role]++
        }

        // 计算消息长度
        const content = msg.content
        let msgLength = 0
        if (typeof content === 'string') {
          msgLength = content.length
        } else if (Array.isArray(content)) {
          msgLength = content.reduce((sum, block) => {
            if (typeof block === 'object' && block !== null && 'text' in block) {
              return sum + String(block.text).length
            }
            return sum
          }, 0)
        }
        totalLength += msgLength

        // 记录 system 消息长度
        if (role === 'system' && !systemPromptLength) {
          systemPromptLength = msgLength
        }
      })

      features.request = {
        messageCount: messages.length,
        roleDistribution,
        avgMessageLength: messages.length > 0 ? Math.round(totalLength / messages.length) : 0,
        systemPromptLength,
      }
    }

    // 2. 响应内容统计
    if (log.responseBody?.content && Array.isArray(log.responseBody.content)) {
      const content = log.responseBody.content as Array<{ type: string; text?: string }>
      const typeDistribution = { text: 0, toolUse: 0, thinking: 0 }
      let totalLength = 0

      content.forEach((block) => {
        if (block.type === 'text') {
          typeDistribution.text++
          if (block.text) {
            totalLength += block.text.length
          }
        } else if (block.type === 'tool_use') {
          typeDistribution.toolUse++
        } else if (block.type === 'thinking') {
          typeDistribution.thinking++
        }
      })

      features.response = {
        blockCount: content.length,
        typeDistribution,
        totalLength,
      }
    }

    // 3. Token 使用详情
    if (log.inputTokens > 0 || log.outputTokens > 0) {
      const totalTokens = log.inputTokens + log.outputTokens
      const inputRatio = totalTokens > 0 ? (log.inputTokens / totalTokens) * 100 : 0
      const outputRatio = totalTokens > 0 ? (log.outputTokens / totalTokens) * 100 : 0

      // 排除 TTFB，优先用 streamDurationMs，回退用总响应时间减去网关和 TTFB
      const perf = log.metadata?.performance
      const streamMs = perf?.streamDurationMs
      const genMs =
        streamMs && streamMs > 0
          ? streamMs
          : log.responseTimeMs - (perf?.gatewayOverheadMs ?? 0) - (perf?.providerTtfbMs ?? 0)
      const tokensPerSecond = genMs > 0 ? log.outputTokens / (genMs / 1000) : 0
      const tokensPerMessage = features.request?.messageCount
        ? log.inputTokens / features.request.messageCount
        : 0

      features.tokens = {
        inputOutputRatio: {
          input: Math.round(inputRatio * 10) / 10,
          output: Math.round(outputRatio * 10) / 10,
        },
        tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
        tokensPerMessage: Math.round(tokensPerMessage),
      }
    }

    // 4. 工具使用详情
    if (log.metadata?.toolCalls) {
      const toolCalls = log.metadata.toolCalls as { pattern?: string; tools?: string[] }
      features.tools = {
        pattern: toolCalls.pattern || 'unknown',
        complexity: toolCalls.tools?.length || 0,
      }
    }

    // 5. 内容复杂度指标
    if (log.inputTokens > 0) {
      let contextLevel: 'short' | 'medium' | 'long' | 'extra-long'
      if (log.inputTokens < 1000) {
        contextLevel = 'short'
      } else if (log.inputTokens < 10000) {
        contextLevel = 'medium'
      } else if (log.inputTokens < 50000) {
        contextLevel = 'long'
      } else {
        contextLevel = 'extra-long'
      }

      // 计算内容密度（字符数 / Token 数）
      const totalChars =
        (features.request?.avgMessageLength || 0) * (features.request?.messageCount || 0)
      const contentDensity = log.inputTokens > 0 ? totalChars / log.inputTokens : 0

      features.complexity = {
        contextLevel,
        contentDensity: Math.round(contentDensity * 10) / 10,
      }
    }

    return Object.keys(features).length > 0 ? features : null
  } catch {
    return null
  }
}
