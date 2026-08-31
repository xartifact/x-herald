import rootLogger from '../../lib/logger'

const logger = rootLogger.child({ module: 'error-classifier' })

function bytesToMB(bytes: number): string {
  return (Math.round((bytes / 1024 / 1024) * 10) / 10).toFixed(1)
}

// 各 Provider（x.ai、Moonshot 等）拒绝 tool schema 时的报错关键词，用于主动发现新的
// tool schema 兼容性问题，而不是被动等用户报告。命中后只打日志，不改变响应/行为。
const TOOL_SCHEMA_KEYWORDS = [
  'tool parameter',
  'tools.function.parameters',
  'moonshot flavored json schema',
  'anyof/oneof',
]

export function looksLikeToolSchemaError(rawMessage: string, statusCode: number): boolean {
  if (statusCode !== 400) return false
  const lower = rawMessage.toLowerCase()
  return TOOL_SCHEMA_KEYWORDS.some((keyword) => lower.includes(keyword))
}

export function normalizeProviderErrorMessage(rawMessage: string): {
  message: string
  code: string
} {
  const sizeMatch = rawMessage.match(/total message size (\d+) exceeds limit (\d+)/i)
  if (sizeMatch) {
    const actualMB = bytesToMB(parseInt(sizeMatch[1], 10))
    const limitMB = bytesToMB(parseInt(sizeMatch[2], 10))
    return {
      code: 'context_length_exceeded',
      message: `Message content too large (~${actualMB} MB). Model limit is ${limitMB} MB. Please reduce conversation history.`,
    }
  }

  if (/Cannot connect to host|Connect call failed/i.test(rawMessage)) {
    return {
      code: 'provider_service_unavailable',
      message: 'Provider service is temporarily unavailable. Please try again later.',
    }
  }

  const bodyLimitMatch = rawMessage.match(
    /Exceeded limit on max bytes to request body\s*:\s*(\d+)/i,
  )
  if (bodyLimitMatch) {
    const limitMB = bytesToMB(parseInt(bodyLimitMatch[1], 10))
    return {
      code: 'request_too_large',
      message: `Request body too large (~${limitMB} MB). Please reduce request size.`,
    }
  }

  if (
    /an assistant message with 'tool_calls' must be followed by tool messages/i.test(rawMessage)
  ) {
    const idsMatch = rawMessage.match(/tool_call_ids did not have response messages:\s*(.+)$/i)
    const idsPart = idsMatch ? ` Missing IDs: ${idsMatch[1].trim()}.` : ''
    return {
      code: 'invalid_tool_call_format',
      message: `Invalid message format: tool_call responses are missing.${idsPart}`,
    }
  }

  return { code: 'provider_error', message: rawMessage }
}

export async function parseProviderError(
  response: Response,
): Promise<{ error?: { message?: string }; [key: string]: unknown }> {
  const contentType = response.headers.get('content-type') || ''
  let text = ''
  try {
    text = await response.text()
  } catch (err) {
    // 读取 body 本身失败（连接被截断/重置），和上游真的返回空 body 表现完全一样
    // （都会走到下面的 'Provider request failed' 兜底），必须单独打日志才能区分，
    // 否则没法判断是本地网络/代理层丢了数据，还是上游真的没给内容。
    logger.warn(
      { err, status: response.status, contentType },
      'Failed to read provider error response body (likely a truncated/reset connection, not necessarily an empty upstream response)',
    )
  }

  if (contentType.includes('text/event-stream') || text.startsWith('data:')) {
    const lines = text.split('\n')
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          return JSON.parse(data)
        } catch {
          /* next line */
        }
      }
    }
    return { error: { message: text } }
  }

  try {
    return JSON.parse(text)
  } catch {
    return { error: { message: text || 'Provider request failed' } }
  }
}

export function extractProviderResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  return headers
}
