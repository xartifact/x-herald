function bytesToMB(bytes: number): string {
  return (Math.round((bytes / 1024 / 1024) * 10) / 10).toFixed(1)
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
  const text = await response.text().catch(() => '')

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
