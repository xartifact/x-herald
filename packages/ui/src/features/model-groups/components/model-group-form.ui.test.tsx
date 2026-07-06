import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, UseFormReturn } from 'react-hook-form'
import { ModelGroupForm } from './model-group-form'

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
    <ModelGroupForm
      open={open}
      onOpenChange={onOpenChange}
      form={form as unknown as UseFormReturn<Record<string, unknown>>}
      editingId={editingId}
      isPending={isPending}
      onSubmit={onSubmit}
    />
  )
}

describe('ModelGroupForm', () => {
  const validDefaults: Record<string, unknown> = {
    name: 'gpt-4',
    aliases: '',
    displayName: 'GPT-4',
    description: '',
    category: 'chat',
    capabilities: {
      streaming: true,
      functionCalling: false,
      vision: false,
      jsonMode: false,
      maxTokens: 4096,
      contextWindow: 8192,
    },
    routingStrategy: 'smart',
    fallbackEnabled: true,
  }

  it('renders group fields (name, displayName, category, capabilities)', () => {
    render(<TestWrapper defaultValues={validDefaults} />)

    expect(screen.getByText('添加模型组')).toBeInTheDocument()
    expect(screen.getByText('模型组名称 *')).toBeInTheDocument()
    expect(screen.getByText('显示名称 *')).toBeInTheDocument()
    expect(screen.getByText('类别')).toBeInTheDocument()
    expect(screen.getByText('能力配置')).toBeInTheDocument()
  })

  it('shows routing strategy selector', () => {
    render(<TestWrapper defaultValues={validDefaults} />)

    expect(screen.getByText('路由配置')).toBeInTheDocument()
    expect(screen.getByText('路由策略')).toBeInTheDocument()
  })

  it('shows edit title when editingId is provided', () => {
    render(<TestWrapper defaultValues={validDefaults} editingId="group-123" />)

    expect(screen.getByText('编辑模型组')).toBeInTheDocument()
  })

  it('submits with correct payload on valid input', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<TestWrapper defaultValues={validDefaults} onSubmit={onSubmit} />)

    const nameInput = screen.getByPlaceholderText('gpt-4')
    await user.clear(nameInput)
    await user.type(nameInput, 'claude-3')

    const submitButton = screen.getByRole('button', { name: '创建' })
    await user.click(submitButton)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const submitted = onSubmit.mock.calls[0][0] as Record<string, unknown>
    expect(submitted.name).toBe('claude-3')
    expect(submitted.routingStrategy).toBe('smart')
    expect(submitted.fallbackEnabled).toBe(true)
  })

  it('calls onOpenChange when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<TestWrapper defaultValues={validDefaults} onOpenChange={onOpenChange} />)

    const cancelButton = screen.getByRole('button', { name: '取消' })
    await user.click(cancelButton)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('disables submit button when isPending is true', () => {
    render(<TestWrapper defaultValues={validDefaults} isPending={true} />)

    const submitButton = screen.getByRole('button', { name: '保存中...' })
    expect(submitButton).toBeDisabled()
  })
})
