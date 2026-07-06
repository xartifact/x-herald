import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { KeyFormDialog } from './key-form-dialog'
import type { KeyFormData } from './key-form-types'

const keySchema = z.object({
  name: z.string().min(2, '名称至少需要 2 个字符'),
  allowedModels: z.string(),
  rateLimitRpm: z.number().optional().nullable(),
  rateLimitRpd: z.number().optional().nullable(),
  tokenLimitDaily: z.number().optional().nullable(),
  enabled: z.boolean(),
  expiresAt: z.string(),
})

type KeyFormSchema = z.infer<typeof keySchema>

function TestWrapper({
  open = true,
  onOpenChange = () => {},
  editingId = null,
  isPending = false,
  showNewKey = false,
  newlyCreatedKey = null,
  copiedKey = null,
  onSubmit = () => {},
  onCopyNewKey = () => {},
  defaultValues,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  editingId?: string | null
  isPending?: boolean
  showNewKey?: boolean
  newlyCreatedKey?: string | null
  copiedKey?: string | null
  onSubmit?: (data: KeyFormData) => void
  onCopyNewKey?: () => void
  defaultValues: KeyFormData
}) {
  const form = useForm<KeyFormSchema>({
    resolver: zodResolver(keySchema),
    defaultValues,
    mode: 'onChange',
  })

  return (
    <KeyFormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form as unknown as UseFormReturn<KeyFormData>}
      editingId={editingId}
      isPending={isPending}
      showNewKey={showNewKey}
      newlyCreatedKey={newlyCreatedKey}
      copiedKey={copiedKey}
      onSubmit={onSubmit}
      onCopyNewKey={onCopyNewKey}
    />
  )
}

describe('KeyFormDialog', () => {
  const validDefaults: KeyFormData = {
    name: 'Test Key',
    allowedModels: '',
    enabled: true,
    expiresAt: '',
  }

  it('renders form with name, rate limits, and enabled fields', () => {
    render(<TestWrapper defaultValues={validDefaults} />)

    expect(screen.getByRole('heading', { name: '创建密钥' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('生产环境密钥')).toBeInTheDocument()
    expect(screen.getByText('启用密钥')).toBeInTheDocument()
    expect(screen.getByText('每分钟请求数 (RPM)')).toBeInTheDocument()
    expect(screen.getByText('每天请求数 (RPD)')).toBeInTheDocument()
    expect(screen.getByText('每日 Token 限制')).toBeInTheDocument()
  })

  it('shows newly created key value after submission', () => {
    render(
      <TestWrapper
        defaultValues={validDefaults}
        showNewKey={true}
        newlyCreatedKey="sk-newly-created-123"
      />,
    )

    expect(screen.getByText('sk-newly-created-123')).toBeInTheDocument()
    expect(screen.getByText(/请保存您的 API 密钥/)).toBeInTheDocument()
  })

  it('validates required name field minimum length', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        defaultValues={{
          name: '',
          allowedModels: '',
          enabled: true,
          expiresAt: '',
        }}
      />,
    )

    const nameInput = screen.getByPlaceholderText('生产环境密钥')
    await user.type(nameInput, 'A')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText('名称至少需要 2 个字符')).toBeInTheDocument()
    })
  })

  it('handles edit mode with pre-filled existing values', () => {
    render(
      <TestWrapper
        defaultValues={{
          name: 'Existing Key',
          allowedModels: 'gpt-4, claude-3',
          enabled: false,
          rateLimitRpm: 100,
          rateLimitRpd: 1000,
          tokenLimitDaily: 50000,
          expiresAt: '2025-12-31',
        }}
        editingId="key-123"
      />,
    )

    expect(screen.getByText('编辑密钥')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing Key')).toBeInTheDocument()
    expect(screen.getByDisplayValue('gpt-4, claude-3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('50000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2025-12-31')).toBeInTheDocument()

    const switchInput = screen.getByRole('switch')
    expect(switchInput).not.toBeChecked()
  })

  it('submits with correct payload on valid input', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<TestWrapper defaultValues={validDefaults} onSubmit={onSubmit} />)

    const nameInput = screen.getByPlaceholderText('生产环境密钥')
    await user.clear(nameInput)
    await user.type(nameInput, 'Production Key')

    const submitButton = screen.getByRole('button', { name: '创建密钥' })
    await user.click(submitButton)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    const submitted = onSubmit.mock.calls[0][0] as KeyFormData
    expect(submitted.name).toBe('Production Key')
    expect(submitted.enabled).toBe(true)
  })

  it('calls onOpenChange when close button is clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<TestWrapper defaultValues={validDefaults} onOpenChange={onOpenChange} />)

    const closeButton = screen.getByRole('button', { name: '关闭' })
    await user.click(closeButton)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('hides submit button when showing new key', () => {
    render(
      <TestWrapper defaultValues={validDefaults} showNewKey={true} newlyCreatedKey="sk-new-key" />,
    )

    expect(screen.queryByRole('button', { name: '创建密钥' })).not.toBeInTheDocument()
  })
})
