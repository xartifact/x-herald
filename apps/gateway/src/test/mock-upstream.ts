/**
 * Mock Upstream LLM Server — simulates OpenAI / Anthropic API responses.
 *
 * Uses Bun.serve() on a random port for real HTTP stack (headers, SSE streaming,
 * connection management). Provider baseUrl should point to the returned URL.
 *
 * Usage:
 *   const upstream = createMockUpstream();
 *   // Create provider with baseUrl = upstream.url
 *   upstream.setResponse(200, openaiChatCompletion({ content: 'Hello!' }));
 *   // Make proxy request through gateway...
 *   expect(upstream.receivedRequests).toHaveLength(1);
 *   upstream.close();
 */

// ─── Received Request Tracking ──────────────────────────────────────────────

export interface ReceivedRequest {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
  timestamp: number
}

// ─── Handler Types ───────────────────────────────────────────────────────────

type UpstreamHandler = (req: Request) => Response | Promise<Response>

// ─── Mock Upstream Instance ──────────────────────────────────────────────────

export interface MockUpstream {
  /** Base URL, e.g. http://localhost:34567 — use as provider baseUrl */
  url: string
  /** Actual port assigned by the OS */
  port: number
  /** Close the underlying server */
  close(): void

  // ── Handler Configuration ──────────────────────────────────────────────────

  /** Set a custom handler — takes priority over convenience methods */
  setHandler(handler: UpstreamHandler): void

  /** Set a static JSON response */
  setResponse(status: number, body: unknown, headers?: Record<string, string>): void

  /** Set a streaming SSE response from pre-built SSE chunks */
  setStreamResponse(sseChunks: string[], headers?: Record<string, string>): void

  /** Set an OpenAI-style error response */
  setOpenAIError(status: number, message: string, type?: string): void

  /** Set an Anthropic-style error response */
  setAnthropicError(status: number, message: string, type?: string): void

  /** Set a delayed response (for timeout / TTFB testing) */
  setDelayedResponse(delayMs: number, status?: number, body?: unknown): void

  /** Reset to default 200 OK with empty body */
  reset(): void

  // ── Request Tracking ───────────────────────────────────────────────────────

  /** All requests received by the server */
  receivedRequests: ReceivedRequest[]
  /** Clear request history */
  clearRequests(): void
  /** Get the last received request (throws if none) */
  lastRequest(): ReceivedRequest
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createMockUpstream(): MockUpstream {
  let handler: UpstreamHandler = defaultHandler
  const receivedRequests: ReceivedRequest[] = []

  const server = Bun.serve({
    port: 0,
    async fetch(req: Request): Promise<Response> {
      // Track request
      let parsedBody: unknown = null
      try {
        const cloned = req.clone()
        parsedBody = await cloned.json()
      } catch {
        // Not JSON — try text
        try {
          parsedBody = await req.clone().text()
        } catch {
          // Empty or binary — leave as null
        }
      }

      const headers: Record<string, string> = {}
      req.headers.forEach((value, key) => {
        headers[key] = value
      })

      receivedRequests.push({
        method: req.method,
        url: req.url,
        headers,
        body: parsedBody,
        timestamp: Date.now(),
      })

      return handler(req)
    },
  })

  const upstream: MockUpstream = {
    url: `http://localhost:${server.port}`,
    port: server.port!,
    close: () => server.stop(true),

    setHandler: (h: UpstreamHandler) => {
      handler = h
    },

    setResponse: (status: number, body: unknown, headers?: Record<string, string>) => {
      handler = () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json', ...headers },
        })
    },

    setStreamResponse: (sseChunks: string[], headers?: Record<string, string>) => {
      handler = () => {
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of sseChunks) {
              controller.enqueue(new TextEncoder().encode(chunk))
            }
            controller.close()
          },
        })
        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            ...headers,
          },
        })
      }
    },

    setOpenAIError: (status: number, message: string, type?: string) => {
      handler = () =>
        new Response(
          JSON.stringify({
            error: {
              message,
              type: type ?? 'invalid_request_error',
              code: null,
            },
          }),
          { status, headers: { 'Content-Type': 'application/json' } },
        )
    },

    setAnthropicError: (status: number, message: string, type?: string) => {
      handler = () =>
        new Response(
          JSON.stringify({
            type: 'error',
            error: {
              type: type ?? 'invalid_request_error',
              message,
            },
          }),
          { status, headers: { 'Content-Type': 'application/json' } },
        )
    },

    setDelayedResponse: (delayMs: number, status?: number, body?: unknown) => {
      handler = async () => {
        await Bun.sleep(delayMs)
        return new Response(JSON.stringify(body ?? { ok: true }), {
          status: status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    },

    reset: () => {
      handler = defaultHandler
    },

    receivedRequests,
    clearRequests: () => {
      receivedRequests.length = 0
    },
    lastRequest: () => {
      if (receivedRequests.length === 0) {
        throw new Error('No requests received by mock upstream')
      }
      return receivedRequests[receivedRequests.length - 1]
    },
  }

  return upstream
}

// ─── Default Handler ──────────────────────────────────────────────────────────

const defaultHandler: UpstreamHandler = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

// ━━━ Response Template Factories ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── OpenAI Templates ─────────────────────────────────────────────────────────

export function openaiChatCompletion(opts?: {
  content?: string
  model?: string
  finishReason?: string
  promptTokens?: number
  completionTokens?: number
}): unknown {
  const content = opts?.content ?? 'Hello from mock OpenAI!'
  const model = opts?.model ?? 'gpt-4-turbo'
  return {
    id: 'chatcmpl-mock-' + Math.random().toString(36).slice(2, 12),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: opts?.finishReason ?? 'stop',
      },
    ],
    usage: {
      prompt_tokens: opts?.promptTokens ?? 10,
      completion_tokens: opts?.completionTokens ?? 5,
      total_tokens: (opts?.promptTokens ?? 10) + (opts?.completionTokens ?? 5),
    },
  }
}

export function openaiChatCompletionChunks(opts?: { content?: string; model?: string }): string[] {
  const content = opts?.content ?? 'Hello!'
  const model = opts?.model ?? 'gpt-4-turbo'
  const id = 'chatcmpl-mock-' + Math.random().toString(36).slice(2, 12)
  const ts = Math.floor(Date.now() / 1000)

  // Split content into character chunks to simulate streaming
  const chars = content.split('')
  const chunks: string[] = []

  // First chunk: role
  chunks.push(
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created: ts,
      model,
      choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
    })}\n\n`,
  )

  // Content chunks
  for (const char of chars) {
    chunks.push(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created: ts,
        model,
        choices: [{ index: 0, delta: { content: char }, finish_reason: null }],
      })}\n\n`,
    )
  }

  // Final chunk: finish_reason
  chunks.push(
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created: ts,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`,
  )

  // Usage chunk (if stream_options.include_usage)
  chunks.push(
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created: ts,
      model,
      choices: [],
      usage: {
        prompt_tokens: 10,
        completion_tokens: chars.length,
        total_tokens: 10 + chars.length,
      },
    })}\n\n`,
  )

  // Terminator
  chunks.push('data: [DONE]\n\n')

  return chunks
}

// ─── Anthropic Templates ──────────────────────────────────────────────────────

export function anthropicMessages(opts?: {
  content?: string
  model?: string
  stopReason?: string
  inputTokens?: number
  outputTokens?: number
}): unknown {
  const content = opts?.content ?? 'Hello from mock Anthropic!'
  const model = opts?.model ?? 'claude-3-5-sonnet-20241022'
  return {
    id: 'msg_mock_' + Math.random().toString(36).slice(2, 12),
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: content }],
    stop_reason: opts?.stopReason ?? 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: opts?.inputTokens ?? 10,
      output_tokens: opts?.outputTokens ?? 5,
    },
  }
}

export function anthropicMessagesChunks(opts?: { content?: string; model?: string }): string[] {
  const content = opts?.content ?? 'Hello!'
  const model = opts?.model ?? 'claude-3-5-sonnet-20241022'
  const msgId = 'msg_mock_' + Math.random().toString(36).slice(2, 12)

  const chunks: string[] = []

  // message_start
  chunks.push(
    `event: message_start\ndata: ${JSON.stringify({
      type: 'message_start',
      message: {
        id: msgId,
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    })}\n\n`,
  )

  // content_block_start
  chunks.push(
    `event: content_block_start\ndata: ${JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    })}\n\n`,
  )

  // content_block_delta — one per character
  for (const char of content) {
    chunks.push(
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: char },
      })}\n\n`,
    )
  }

  // content_block_stop
  chunks.push(
    `event: content_block_stop\ndata: ${JSON.stringify({
      type: 'content_block_stop',
      index: 0,
    })}\n\n`,
  )

  // message_delta
  chunks.push(
    `event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: content.length },
    })}\n\n`,
  )

  // message_stop
  chunks.push(
    `event: message_stop\ndata: ${JSON.stringify({
      type: 'message_stop',
    })}\n\n`,
  )

  return chunks
}
