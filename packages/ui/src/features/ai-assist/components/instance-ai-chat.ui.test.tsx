import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { InstanceAiChat } from './instance-ai-chat'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubBrowserGlobals(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window, 'fetch', { configurable: true, value: fetchMock })
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'test-admin-token') })
}

async function openChat() {
  const user = userEvent.setup()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <InstanceAiChat instanceId="one" instanceName="MiMo" />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByTitle('AI 配置助手'))
  const input = screen.getByPlaceholderText(/描述你想要的配置/) as HTMLTextAreaElement
  await user.type(input, 'Map xhigh to high')
  expect(input.value).toBe('Map xhigh to high')
  const sendButton = input.parentElement?.querySelector('button')
  if (!sendButton) throw new Error('Chat send button not found')
  await waitFor(() => expect(sendButton).not.toBeDisabled())
  fireEvent.click(sendButton)
}

describe('instance AI chat execution feedback', () => {
  it('shows a successful Pi run and retains undo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            explanation: '已映射思考程度',
            previousConfig: {},
            newConfig: {},
            instanceName: 'MiMo',
            execution: { runtime: 'pi', status: 'completed', turns: 1 },
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ success: true }))
    stubBrowserGlobals(fetchMock)
    await openChat()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('配置已更新'))
    expect(screen.getByRole('status').textContent).toContain('1 轮分析')
    fireEvent.click(screen.getByTitle('撤销此次修改'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][0]).toBe('/api/ai/agent/instance/one/undo')
  })

  it('shows incomplete execution without adding a successful change record', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          success: false,
          error: '配置助手未完成',
          code: 'AGENT_INCOMPLETE',
          execution: { runtime: 'pi', status: 'max_turns', turns: 10 },
        },
        { status: 422 },
      ),
    )
    stubBrowserGlobals(fetchMock)
    await openChat()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('达到分析轮次上限'),
    )
    expect(screen.queryByTitle('撤销此次修改')).toBeNull()
    expect(screen.getByText('配置助手未完成')).toBeTruthy()
  })
})
