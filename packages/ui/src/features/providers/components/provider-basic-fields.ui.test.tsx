import { describe, it, expect, vi } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { Form } from '../../../shared/components/ui/form'
import { ProviderBasicFields } from './provider-basic-fields'
import type { ProviderFormData } from './provider-form-types'

function TestWrapper({
  defaultValues,
  showApiKey,
  onToggleShowApiKey,
}: {
  defaultValues: ProviderFormData
  showApiKey: boolean
  onToggleShowApiKey: () => void
}) {
  const form = useForm<ProviderFormData>({ defaultValues })
  return (
    <Form {...form}>
      <form>
        <ProviderBasicFields
          form={form}
          showApiKey={showApiKey}
          onToggleShowApiKey={onToggleShowApiKey}
        />
      </form>
    </Form>
  )
}

describe('ProviderBasicFields', () => {
  const defaultValues: ProviderFormData = {
    name: '',
    apiKey: '',
    enabled: true,
    protocols: {
      openai: { enabled: false },
    },
  }

  it('renders name input and api key input', () => {
    render(
      <TestWrapper
        defaultValues={defaultValues}
        showApiKey={false}
        onToggleShowApiKey={() => {}}
      />,
    )

    expect(screen.getByPlaceholderText('X-AIO API')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument()
    expect(screen.getByText('供应商名称 *')).toBeInTheDocument()
    expect(screen.getByText('API 密钥')).toBeInTheDocument()
    expect(screen.getByText('启用供应商')).toBeInTheDocument()
    expect(screen.getByText('禁用后此供应商将不会被路由使用')).toBeInTheDocument()
  })

  it('api key input is password type when hidden', () => {
    render(
      <TestWrapper
        defaultValues={defaultValues}
        showApiKey={false}
        onToggleShowApiKey={() => {}}
      />,
    )

    const apiKeyInput = screen.getByPlaceholderText('sk-...')
    expect(apiKeyInput).toHaveAttribute('type', 'password')
  })

  it('api key input is text type when shown', () => {
    render(
      <TestWrapper
        defaultValues={{ ...defaultValues, apiKey: 'secret-key' }}
        showApiKey={true}
        onToggleShowApiKey={() => {}}
      />,
    )

    const apiKeyInput = screen.getByPlaceholderText('sk-...')
    expect(apiKeyInput).toHaveAttribute('type', 'text')
    expect(apiKeyInput).toHaveValue('secret-key')
  })

  it('calls onToggleShowApiKey when toggle button is clicked', async () => {
    const onToggleShowApiKey = vi.fn()
    const user = userEvent.setup()
    render(
      <TestWrapper
        defaultValues={defaultValues}
        showApiKey={false}
        onToggleShowApiKey={onToggleShowApiKey}
      />,
    )

    const toggleButton = screen.getByRole('button')
    await user.click(toggleButton)
    expect(onToggleShowApiKey).toHaveBeenCalledTimes(1)
  })

  it('allows typing in name and api key inputs', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper defaultValues={defaultValues} showApiKey={true} onToggleShowApiKey={() => {}} />,
    )

    const nameInput = screen.getByPlaceholderText('X-AIO API')
    await user.type(nameInput, 'My Provider')
    expect(nameInput).toHaveValue('My Provider')

    const apiKeyInput = screen.getByPlaceholderText('sk-...')
    await user.type(apiKeyInput, 'sk-new-key')
    expect(apiKeyInput).toHaveValue('sk-new-key')
  })

  it('renders switch as checked when enabled is true', () => {
    render(
      <TestWrapper
        defaultValues={defaultValues}
        showApiKey={false}
        onToggleShowApiKey={() => {}}
      />,
    )

    const switchInput = screen.getByRole('switch')
    expect(switchInput).toBeChecked()
  })

  it('renders switch as unchecked when enabled is false', () => {
    render(
      <TestWrapper
        defaultValues={{ ...defaultValues, enabled: false }}
        showApiKey={false}
        onToggleShowApiKey={() => {}}
      />,
    )

    const switchInput = screen.getByRole('switch')
    expect(switchInput).not.toBeChecked()
  })
})
