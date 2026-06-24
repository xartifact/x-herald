import { describe, it, expect } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ProviderProtocolFields } from './provider-protocol-fields'
import { providerSchema, PROTOCOL_OPTIONS } from '../provider-form-schema'
import { Form } from '../../../shared/components/ui/form'
import type { ProviderFormData } from './provider-form-types'

function TestWrapper({ defaultValues }: { defaultValues: ProviderFormData }) {
  const form = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
    defaultValues,
    mode: 'onChange',
  })
  return (
    <Form {...form}>
      <form>
        <ProviderProtocolFields form={form} protocolOptions={PROTOCOL_OPTIONS} />
      </form>
    </Form>
  )
}

describe('ProviderProtocolFields', () => {
  it('renders all protocol options', () => {
    render(
      <TestWrapper
        defaultValues={{
          name: 'Test',
          enabled: true,
          protocols: {
            openai: { enabled: true },
            anthropic: { enabled: false },
            gemini: { enabled: false },
          },
        }}
      />
    )

    expect(screen.getByRole('checkbox', { name: /OpenAI/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Anthropic/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Google Gemini/i })).toBeInTheDocument()
  })

  it('shows baseUrl input only for enabled protocols', () => {
    render(
      <TestWrapper
        defaultValues={{
          name: 'Test',
          enabled: true,
          protocols: {
            openai: { enabled: true },
            anthropic: { enabled: false },
            gemini: { enabled: false },
          },
        }}
      />
    )

    expect(screen.getByPlaceholderText('https://api.openai.com/v1')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('https://api.anthropic.com/v1')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('https://generativelanguage.googleapis.com/v1')).not.toBeInTheDocument()

    cleanup()

    render(
      <TestWrapper
        defaultValues={{
          name: 'Test',
          enabled: true,
          protocols: {
            openai: { enabled: true },
            anthropic: { enabled: true },
            gemini: { enabled: false },
          },
        }}
      />
    )

    expect(screen.getByPlaceholderText('https://api.openai.com/v1')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('https://api.anthropic.com/v1')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('https://generativelanguage.googleapis.com/v1')).not.toBeInTheDocument()
  })

  it('hides baseUrl input when protocol is disabled', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        defaultValues={{
          name: 'Test',
          enabled: true,
          protocols: {
            openai: { enabled: true },
            anthropic: { enabled: false },
            gemini: { enabled: false },
          },
        }}
      />
    )

    const openaiCheckbox = screen.getByRole('checkbox', { name: /OpenAI/i })
    await user.click(openaiCheckbox)

    expect(screen.queryByPlaceholderText('https://api.openai.com/v1')).not.toBeInTheDocument()
  })

  it('shows refine error message when no protocol enabled', async () => {
    function InvalidFormWrapper() {
      const form = useForm<ProviderFormData>({
        resolver: zodResolver(providerSchema),
        defaultValues: {
          name: 'Test',
          enabled: true,
          protocols: {
            openai: { enabled: false },
            anthropic: { enabled: false },
            gemini: { enabled: false },
          },
        },
        mode: 'onChange',
      })

      React.useEffect(() => {
        form.trigger()
      }, [form])

      return (
        <Form {...form}>
          <form>
            <ProviderProtocolFields form={form} protocolOptions={PROTOCOL_OPTIONS} />
          </form>
        </Form>
      )
    }

    render(<InvalidFormWrapper />)
    await waitFor(() => {
      expect(screen.getByText('至少需要启用一个协议')).toBeInTheDocument()
    })
  })

  it('does not show refine error when at least one protocol enabled', () => {
    render(
      <TestWrapper
        defaultValues={{
          name: 'Test',
          enabled: true,
          protocols: {
            openai: { enabled: true },
            anthropic: { enabled: false },
            gemini: { enabled: false },
          },
        }}
      />
    )

    expect(screen.queryByText('至少需要启用一个协议')).not.toBeInTheDocument()
  })

  it('baseUrl input shows placeholder with default URL', () => {
    render(
      <TestWrapper
        defaultValues={{
          name: 'Test',
          enabled: true,
          protocols: {
            openai: { enabled: true },
            anthropic: { enabled: true },
            gemini: { enabled: true },
          },
        }}
      />
    )

    expect(screen.getByPlaceholderText('https://api.openai.com/v1')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('https://api.anthropic.com/v1')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('https://generativelanguage.googleapis.com/v1')).toBeInTheDocument()
  })

  it('baseUrl input value updates', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        defaultValues={{
          name: 'Test',
          enabled: true,
          protocols: {
            openai: { enabled: true, baseUrl: '' },
            anthropic: { enabled: false },
            gemini: { enabled: false },
          },
        }}
      />
    )

    const input = screen.getByPlaceholderText('https://api.openai.com/v1')
    await user.type(input, 'https://custom.example.com')

    expect(input).toHaveValue('https://custom.example.com')
  })
})
