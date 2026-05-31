import type { Log } from '@x-llm-gateway/shared'

export interface ContentFeatures {
  types?: string[]
  hasFunctionCalling?: boolean
  toolNames?: string[]
  messageCount?: number
  roleDistribution?: Record<string, number>
  totalLength?: number
}

export function extractContentFeatures(log: Log): ContentFeatures | null {
  try {
    const features: ContentFeatures = {}

    // Extract from metadata.content
    if (log.metadata?.content) {
      const content = log.metadata.content
      if (content.types && content.types.length > 0) {
        features.types = content.types
      }
      if (content.hasFunctionCalling != null) {
        features.hasFunctionCalling = content.hasFunctionCalling
      }
      if (content.toolNames && content.toolNames.length > 0) {
        features.toolNames = content.toolNames
      }
    }

    // Extract from request body messages
    if (log.requestBody?.messages && Array.isArray(log.requestBody.messages)) {
      const messages = log.requestBody.messages as Array<{ role: string; content: unknown }>
      const roleDistribution: Record<string, number> = {}
      let totalLength = 0

      messages.forEach((msg) => {
        const role = msg.role
        roleDistribution[role] = (roleDistribution[role] || 0) + 1

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
      })

      features.messageCount = messages.length
      features.roleDistribution = roleDistribution
      features.totalLength = totalLength
    }

    // Extract from metadata.toolCalls
    if (log.metadata?.toolCalls) {
      const toolCalls = log.metadata.toolCalls
      if (toolCalls.tools && toolCalls.tools.length > 0) {
        features.toolNames = toolCalls.tools
      }
      if (!features.hasFunctionCalling && toolCalls.tools && toolCalls.tools.length > 0) {
        features.hasFunctionCalling = true
      }
    }

    return Object.keys(features).length > 0 ? features : null
  } catch {
    return null
  }
}
