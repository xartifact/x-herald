import { describe, it, expect, vi } from 'vite-plus/test'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form } from '../../../shared/components/ui/form'
import { ProviderFormDialog } from './provider-form-dialog'
import { providerSchema, PROTOCOL_OPTIONS } from '../provider-form-schema'
import type { ProviderFormData } from './provider-form-types'

function TestWrapper({
  open = true,
  onOpenChange = () => {},
  editingId = null,
  isPending = false,
  showApiKey = false,
  onToggleShowApiKey = () => {},
  onSubmit = () => {},
  defaultValues,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  editingId?: string | null
  isPending?: boolean
  showApiKey?: boolean
  onToggleShowApiKey?: () => void
  onSubmit?: (data: ProviderFormData) => void
  defaultValues: ProviderFormData
}) {
  const form = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
    defaultValues,
    mode: 'onChange',
  })

  return (
    <ProviderFormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      editingId={editingId}
      isPending={isPending}
      showApiKey={showApiKey}
      onToggleShowApiKey={onToggleShowApiKey}
      onSubmit={onSubmit}
      protocolOptions={PROTOCOL_OPTIONS}
    />
  )
}

describe('ProviderFormDialog', () => {
  const validDefaults: ProviderFormData = {
    name: 'Test Provider',
    apiKey: '',
    enabled: true,
    protocols: {
      openai: { enabled: true, baseUrl: '' },
      anthropic: { enabled: false },
      gemini: { enabled: false },
    },
  }

  it('renders form with name, apiKey, and enabled fields', () => {
    render(<TestWrapper defaultValues={validDefaults} />)

    expect(screen.getByText('添加供应商')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('X-AIO API')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument()
    expect(screen.getByText('启用供应商')).toBeInTheDocument()
  })

  it('shows protocol configuration for openai, anthropic, and gemini', () => {
    render(<TestWrapper defaultValues={validDefaults} />)

    expect(screen.getByRole('checkbox', { name: /OpenAI/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Anthropic/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Google Gemini/i })).toBeInTheDocument()
  })

  it('shows edit title when editingId is provided', () => {
    render(<TestWrapper defaultValues={validDefaults} editingId="provider-123" />)

    expect(screen.getByText('编辑供应商')).toBeInTheDocument()
  })

  it('validates name minimum length of 2 characters', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        defaultValues={{
          name: '',
          apiKey: '',
          enabled: true,
          protocols: {
            openai: { enabled: true, baseUrl: '' },
            anthropic: { enabled: false },
            gemini: { enabled: false },
          },
        }}
      />,
    )

    const nameInput = screen.getByPlaceholderText('X-AIO API')
    await user.type(nameInput, 'A')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText('名称至少需要 2 个字符')).toBeInTheDocument()
    })
  })

  it('validates URL format for protocol baseUrl', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        defaultValues={{
          name: 'Test',
          apiKey: '',
          enabled: true,
          protocols: {
            openai: { enabled: true, baseUrl: '' },
            anthropic: { enabled: false },
            gemini: { enabled: false },
          },
        }}
      />,
    )

    const baseUrlInput = screen.getByPlaceholderText('https://api.openai.com/v1')
    await user.type(baseUrlInput, 'not-a-url')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText('请输入有效的 URL')).toBeInTheDocument()
    })
  })

  it('submits with correct payload on valid input', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<TestWrapper defaultValues={validDefaults} onSubmit={onSubmit} />)

    const nameInput = screen.getByPlaceholderText('X-AIO API')
    await user.clear(nameInput)
    await user.type(nameInput, 'My Provider')

    const submitButton = screen.getByRole('button', { name: '创建' })
    await user.click(submitButton)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    const submitted = onSubmit.mock.calls[0][0] as ProviderFormData
    expect(submitted.name).toBe('My Provider')
    expect(submitted.enabled).toBe(true)
    expect(submitted.protocols.openai?.enabled).toBe(true)
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
