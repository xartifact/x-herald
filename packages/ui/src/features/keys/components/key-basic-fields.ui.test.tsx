import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { Form } from '../../../shared/components/ui/form'
import { KeyBasicFields } from './key-basic-fields'
import type { KeyFormData } from './key-form-types'

function TestWrapper({ defaultValues }: { defaultValues: KeyFormData }) {
  const form = useForm<KeyFormData>({ defaultValues })
  return (
    <Form {...form}>
      <form>
        <KeyBasicFields form={form} />
      </form>
    </Form>
  )
}

describe('KeyBasicFields', () => {
  it('renders name input and enabled switch', () => {
    render(
      <TestWrapper
        defaultValues={{
          name: '',
          allowedModels: '',
          enabled: true,
          expiresAt: '',
        }}
      />
    )

    expect(screen.getByPlaceholderText('生产环境密钥')).toBeInTheDocument()
    expect(screen.getByText('密钥名称 *')).toBeInTheDocument()
    expect(screen.getByText('启用密钥')).toBeInTheDocument()
    expect(screen.getByText('禁用后此密钥将无法访问 API')).toBeInTheDocument()
  })

  it('allows typing in name input', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        defaultValues={{
          name: '',
          allowedModels: '',
          enabled: true,
          expiresAt: '',
        }}
      />
    )

    const input = screen.getByPlaceholderText('生产环境密钥')
    await user.type(input, 'Production Key')
    expect(input).toHaveValue('Production Key')
  })

  it('renders switch as checked when enabled is true', () => {
    render(
      <TestWrapper
        defaultValues={{
          name: 'Test Key',
          allowedModels: '',
          enabled: true,
          expiresAt: '',
        }}
      />
    )

    const switchInput = screen.getByRole('switch')
    expect(switchInput).toBeChecked()
  })

  it('renders switch as unchecked when enabled is false', () => {
    render(
      <TestWrapper
        defaultValues={{
          name: 'Test Key',
          allowedModels: '',
          enabled: false,
          expiresAt: '',
        }}
      />
    )

    const switchInput = screen.getByRole('switch')
    expect(switchInput).not.toBeChecked()
  })

  it('renders with pre-filled name value', () => {
    render(
      <TestWrapper
        defaultValues={{
          name: 'Existing Key',
          allowedModels: '',
          enabled: true,
          expiresAt: '',
        }}
      />
    )

    expect(screen.getByDisplayValue('Existing Key')).toBeInTheDocument()
  })
})
