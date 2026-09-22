import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'

import type { Log } from '@xartifact/x-herald-shared'

import { RequestPanel } from './request-panel'

/**
 * TASK-301: the detail page must distinguish "no transformed body because the
 * request was a same-protocol passthrough" from "no data". The storage plan's
 * Phase 2 stops writing that body precisely because it duplicated the client's
 * own request, so a bare "no data" message would look like a regression to
 * anyone reading the panel.
 */

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

/**
 * Render the panel with the Provider sub-tab active.
 *
 * Two levels of Radix tabs are involved: the outer Body tab must be selected,
 * then the Provider sub-tab. Radix activates a tab on pointer events rather than
 * a bare `click()`, so the trigger is driven the way a real interaction arrives.
 * Without this, the Provider pane renders no content and every query below would
 * miss for reasons unrelated to the behaviour under test.
 * @param log - the log to display.
 */
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

describe('RequestPanel passthrough note', () => {
  it('explains a null transformed body when protocols match', () => {
    renderProviderTab(
      makeLog({
        incomingProtocol: 'openai',
        targetProtocol: 'openai',
        transformedRequestBody: null,
      }),
    )
    expect(screen.getByText(/同协议透传/)).toBeTruthy()
    expect(screen.queryByText('无 Provider 请求数据')).toBeNull()
  })

  it('keeps the generic message for a cross-protocol request with no body', () => {
    // A conversion that produced nothing is genuinely missing data.
    renderProviderTab(
      makeLog({
        incomingProtocol: 'anthropic',
        targetProtocol: 'openai',
        transformedRequestBody: null,
      }),
    )
    expect(screen.getByText('无 Provider 请求数据')).toBeTruthy()
    expect(screen.queryByText(/同协议透传/)).toBeNull()
  })

  it('keeps the generic message when the protocols are unknown', () => {
    // Without both protocols there is no evidence of a passthrough, so the
    // honest answer is still "no data".
    renderProviderTab(
      makeLog({
        incomingProtocol: null,
        targetProtocol: null,
        transformedRequestBody: null,
      }),
    )
    expect(screen.getByText('无 Provider 请求数据')).toBeTruthy()
  })

  it('renders the body when one was stored, even on a passthrough', () => {
    // Older rows recorded before Phase 2 still have a body; it must display.
    renderProviderTab(
      makeLog({
        incomingProtocol: 'openai',
        targetProtocol: 'openai',
        transformedRequestBody: { model: 'gpt-4o', messages: [] },
      }),
    )
    expect(screen.queryByText(/同协议透传/)).toBeNull()
    expect(screen.queryByText('无 Provider 请求数据')).toBeNull()
  })
})
