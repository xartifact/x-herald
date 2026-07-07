export function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

export async function readStream(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let done = false
  while (!done) {
    const result = await reader.read()
    done = result.done
    if (result.value) {
      chunks.push(decoder.decode(result.value, { stream: true }))
    }
  }
  return chunks
}

export function createStreamingResponse(
  chunks: string[],
  options: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const stream = createMockStream(chunks)
  return new Response(stream, {
    status: options.status ?? 200,
    headers: options.headers ?? { 'content-type': 'text/event-stream' },
  })
}
