import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'

import type { Log } from '@xartifact/x-herald-shared'

vi.mock('../../../../shared', () => ({
  HeadersViewer: () => null,
  JsonViewer: ({ data }: { data: unknown }) => <pre>{JSON.stringify(data)}</pre>,
  JsonDiffViewer: () => null,
}))
import { RequestPanel } from './request-panel'

/** Minimal Log with the fields RequestPanel reads. */
function makeLog(overrides: Partial<Log> = {}): Log {
  return {
    id: 'log-1',
    status: 'success',
    modelName: 'gpt-4o',
    requestBody: { messages: [{ role: 'user', content: 'hi' }] },
    requestHeaders: null,
    clientResponseHeaders: null,
    responseBody: null,
    clientIp: null,
    userAgent: null,
    requestPath: '/v1/chat/completions',
    requestMethod: 'POST',
    incomingProtocol: 'openai',
    targetProtocol: 'openai',
    metadata: null,
    toolCallsCount: null,
    ...overrides,
  } as Log
}

function renderProviderTab(log: Log): void {
  render(<RequestPanel log={log} />)
  act(() => {
    screen.getByRole('tab', { name: 'Body' }).click()
  })
  const providerTab = screen.getByRole('tab', { name: 'Provider' })
  act(() => {
    providerTab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    providerTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    providerTab.click()
  })
}

describe('RequestPanel provider payload', () => {
  it('reconstructs the complete provider JSON from client body and diff', () => {
    renderProviderTab(
      makeLog({
        transformedRequestBody: null,
        transformedRequestDiff: [
          { op: 'replace', path: '/messages/0/content', value: 'sanitized' },
          { op: 'add', path: '/model', value: 'gpt-4o' },
        ],
      }),
    )
    expect(screen.getByText('{"messages":[{"role":"user","content":"sanitized"}],"model":"gpt-4o"}')).toBeTruthy()
    expect(screen.queryByText(/同协议透传/)).toBeNull()
  })

  it('prefers a directly stored provider body', () => {
    renderProviderTab(
      makeLog({
        transformedRequestBody: { model: 'stored-model', messages: [] },
        transformedRequestDiff: [{ op: 'replace', path: '/model', value: 'ignored' }],
      }),
    )
    expect(screen.getByText('{"model":"stored-model","messages":[]}')).toBeTruthy()
  })

  it('shows the generic empty state without reconstructable inputs', () => {
    renderProviderTab(makeLog({ requestBody: null, transformedRequestBody: null }))
    expect(screen.getByText('无 Provider 请求数据')).toBeTruthy()
    expect(screen.queryByText(/同协议透传/)).toBeNull()
  })
})
