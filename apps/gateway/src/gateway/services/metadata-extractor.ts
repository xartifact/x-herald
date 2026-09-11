import rootLogger from '../../lib/logger'
import type { LogMetadata } from '../../features/logs/db'

import { extractMessageSequence, extractToolCalls } from './message-extractor'
import {
  extractConversationContext,
  extractContentTypes,
  extractRequestFeatures,
} from './content-extractor'
import {
  extractPerformanceMetrics,
  extractErrorInfo,
  extractBusinessTags,
} from './performance-extractor'

const logger = rootLogger.child({ module: 'gateway' })

export interface MetadataExtractionParams {
  requestBody?: unknown
  standardRequestBody?: unknown
  standardResponseBody?: unknown
  responseBody?: unknown
  errorMessage?: string
  errorType?: string
  statusCode?: number
  responseTimeMs: number
  gatewayOverheadMs?: number
  providerTtfbMs?: number
  streamDurationMs?: number
  outputTokens?: number
  /** 本次响应是否真的产出过可流式内容（text/thinking delta）。仅流式请求会传入；
   *  为 false 时说明 outputTokens 多半来自未增量下发的 tool_calls 参数等一次性 payload，
   *  与 streamDurationMs 不是同一阶段，生成速率不采信 */
  hasStreamedContent?: boolean
  conversationId?: string
  userId?: string
  organizationId?: string
  tags?: string[]
}

export function extractMetadata(params: MetadataExtractionParams): LogMetadata {
  const metadata: LogMetadata = {}

  try {
    const messageSeq = extractMessageSequence(params.requestBody, params.standardRequestBody)
    if (messageSeq) metadata.messageSequence = messageSeq

    const toolCallsInfo = extractToolCalls(params.standardRequestBody, params.standardResponseBody)
    if (toolCallsInfo) metadata.toolCalls = toolCallsInfo

    const conversationInfo = extractConversationContext(params)
    if (conversationInfo) metadata.conversation = conversationInfo

    const contentInfo = extractContentTypes(params.requestBody, params.standardRequestBody)
    if (contentInfo || toolCallsInfo?.tools) {
      metadata.content = {
        ...contentInfo,
        toolNames:
          toolCallsInfo?.tools && toolCallsInfo.tools.length > 0 ? toolCallsInfo.tools : undefined,
      }
    }

    const performanceInfo = extractPerformanceMetrics(params)
    if (performanceInfo) metadata.performance = performanceInfo

    const requestInfo = extractRequestFeatures(
      params.standardRequestBody,
      params.requestBody,
      params.responseBody,
      params.standardResponseBody,
    )
    if (requestInfo) metadata.request = requestInfo

    if (params.errorMessage || params.errorType) {
      const errorInfo = extractErrorInfo(params)
      if (errorInfo) metadata.error = errorInfo
    }

    const businessInfo = extractBusinessTags(params)
    if (businessInfo) metadata.business = businessInfo
  } catch (error) {
    logger.warn({ err: error }, 'Failed to extract metadata')
  }

  return metadata
}
