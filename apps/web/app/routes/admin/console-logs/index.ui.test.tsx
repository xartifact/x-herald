import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import { ConsoleLogsPage } from './index'

// 页面只用本地组件 + hooks，mock fetch 提供 SSE 流
const sseChunks = [
  `data: ${JSON.stringify({
    time: '2026-08-27T01:00:00.000Z',
    level: 'error',
    msg: 'upstream timeout',
    module: 'server',
    fields: { requestId: 'abc' },
  })}\n\n`,
  `data: ${JSON.stringify({
    time: '2026-08-27T01:00:01.000Z',
    level: 'warn',
    msg: 'slow provider',
  })}\n\n`,
]

function makeSSEResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of sseChunks) {
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

describe('ConsoleLogsPage', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    const g = globalThis as unknown as Record<string, unknown>
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    }
    g.fetch = vi.fn(async () => makeSSEResponse())
  })

  it('renders streamed log entries with level and message', async () => {
    render(<ConsoleLogsPage />)

    await waitFor(() => {
      expect(screen.getByText('upstream timeout')).toBeTruthy()
    })
    expect(screen.getByText('slow provider')).toBeTruthy()
    expect(screen.getByText('ERROR')).toBeTruthy()
    expect(screen.getByText('WARN')).toBeTruthy()
  })

  it('shows empty state before logs arrive', async () => {
    ;(globalThis as unknown as Record<string, unknown>).fetch = vi.fn(
      async () =>
        new Response(new ReadableStream(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    )
    render(<ConsoleLogsPage />)
    expect(await screen.findByText(/等待日志/)).toBeTruthy()
  })

  it('clears entries when 清空 clicked', async () => {
    const user = userEvent.setup()
    render(<ConsoleLogsPage />)

    await waitFor(() => {
      expect(screen.getByText('upstream timeout')).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: '清空' }))
    await waitFor(() => {
      expect(screen.queryByText('upstream timeout')).toBeNull()
    })
  })

  it('pauses incoming entries when 暂停 clicked', async () => {
    const user = userEvent.setup()
    render(<ConsoleLogsPage />)

    await waitFor(() => {
      expect(screen.getByText('upstream timeout')).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: /暂停/ }))
    // 暂停后按钮变为"继续"
    expect(screen.getByRole('button', { name: /继续/ })).toBeTruthy()
  })
})
