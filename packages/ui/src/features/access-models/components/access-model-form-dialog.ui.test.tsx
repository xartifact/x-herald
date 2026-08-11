import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, UseFormReturn } from 'react-hook-form'
import { AccessModelFormDialog } from './access-model-form-dialog'

const DEFAULT_CAPABILITIES = {
  streaming: true,
  functionCalling: true,
  vision: true,
  jsonMode: true,
  reasoning: true,
  contextWindow: 1_000_000,
  maxTokens: 0,
}

function TestWrapper({
  open = true,
  onOpenChange = () => {},
  editingId = null,
  isPending = false,
  onSubmit = () => {},
  defaultValues,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  editingId?: string | null
  isPending?: boolean
  onSubmit?: (data: Record<string, unknown>) => void
  defaultValues: Record<string, unknown>
}) {
  const form = useForm({ defaultValues })

  return (
    <AccessModelFormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form as unknown as UseFormReturn<Record<string, unknown>>}
      editingId={editingId}
      isPending={isPending}
      onSubmit={onSubmit as (data: Record<string, unknown>) => void}
    />
  )
}

describe('AccessModelFormDialog - 默认能力配置', () => {
  const validDefaults: Record<string, unknown> = {
    name: '',
    displayName: '',
    description: '',
    enabled: true,
    capabilities: DEFAULT_CAPABILITIES,
  }

  it('所有能力开关默认打开（streaming / functionCalling / vision / jsonMode / reasoning）', () => {
    render(<TestWrapper defaultValues={validDefaults} />)

    const switches = screen.getAllByRole('switch')
    // 1 个 enabled + 5 个 capabilities 开关
    expect(switches).toHaveLength(6)
    switches.forEach((sw) => {
      expect(sw).toHaveAttribute('data-state', 'checked')
    })
  })

  it('上下文窗口默认值为 1,000,000 tokens', () => {
    render(<TestWrapper defaultValues={validDefaults} />)

    const contextWindowInput = screen.getByLabelText('上下文窗口 (tokens)')
    expect(contextWindowInput).toHaveValue(1_000_000)
  })

  it('提交时 capabilities 字段保持默认（所有开关 ON + contextWindow = 1M）', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<TestWrapper defaultValues={validDefaults} onSubmit={onSubmit} />)

    const nameInput = screen.getByPlaceholderText('my-gpt4')
    await user.type(nameInput, 'test-am')

    const submitButton = screen.getByRole('button', { name: '创建' })
    await user.click(submitButton)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const submitted = onSubmit.mock.calls[0][0] as Record<string, unknown>
    const caps = submitted.capabilities as Record<string, unknown>
    expect(caps.streaming).toBe(true)
    expect(caps.functionCalling).toBe(true)
    expect(caps.vision).toBe(true)
    expect(caps.jsonMode).toBe(true)
    expect(caps.reasoning).toBe(true)
    expect(caps.contextWindow).toBe(1_000_000)
  })
})
