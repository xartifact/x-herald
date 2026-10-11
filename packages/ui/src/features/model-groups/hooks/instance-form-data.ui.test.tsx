import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { InstanceFormData } from '@xartifact/x-herald-shared'
import { ModelInstanceForm } from '../components/model-instance-form'
import { describe, expect, it, vi } from 'vitest'
import type { ModelInstance } from '@xartifact/x-herald-shared'
import { instanceFormToPayload, instanceToForm } from './instance-form-data'
import { instanceFormSchema } from './management-form-schema'

describe('instance editing round trip', () => {
  const instance = {
    providerId: 'p1',
    name: 'Primary',
    actualModelName: 'model',
    weight: 100,
    groupIds: ['g1', 'g2'],
    config: { timeout: 30000 },
    costPer1kTokens: {
      input: 2,
      output: 8,
      cache_read: 0.5,
      tiers: [{ input_tokens_above: 200000, input: 4, output: 12 }],
    },
  } as unknown as ModelInstance

  it('preserves pricing, tiers, group membership and config when editing the name', () => {
    const data = instanceToForm(instance)
    data.name = 'Updated'
    const payload = instanceFormToPayload(data)
    expect(payload.costPer1kTokens).toEqual(instance.costPer1kTokens)
    expect(payload.groupIds).toEqual(['g1', 'g2'])
    expect(payload.config).toEqual(instance.config)
    expect(payload.name).toBe('Updated')
    expect(payload.costPer1kTokens).not.toHaveProperty('_enabled')
  })
  it('explicitly clears custom pricing when switched off', () => {
    const data = instanceToForm(instance)
    data.costPer1kTokens!._enabled = false
    expect(instanceFormToPayload(data).costPer1kTokens).toBeNull()
  })
  it('rejects an empty provider, blank names and negative pricing', () => {
    expect(instanceFormSchema.safeParse(instanceToForm()).success).toBe(false)
    const data = instanceToForm(instance)
    data.name = '  '
    data.costPer1kTokens!.input = -1
    const result = instanceFormSchema.safeParse(data)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues.map((item) => item.path[0])).toEqual(['name', 'costPer1kTokens'])
  })
  it('renders the real cost editor, keeps dirty edits on cancelled close, and submits prices', async () => {
    const close = vi.fn()
    const submit = vi.fn()
    function Editor() {
      const form = useForm<InstanceFormData>({
        defaultValues: instanceToForm(instance),
        resolver: zodResolver(instanceFormSchema),
      })
      return (
        <ModelInstanceForm
          open
          onOpenChange={close}
          form={form as any}
          editingId="i1"
          isPending={false}
          providers={[]}
          groups={[]}
          onSubmit={submit}
        />
      )
    }
    const user = userEvent.setup()
    render(<Editor />)
    await user.click(screen.getByRole('tab', { name: '计费与能力' }))
    expect(screen.getAllByRole('spinbutton', { name: '输入单价', exact: true })[0]).toHaveValue(2)
    await user.clear(screen.getAllByRole('spinbutton', { name: '输入单价', exact: true })[0])
    await user.type(screen.getAllByRole('spinbutton', { name: '输入单价', exact: true })[0], '3')
    await waitFor(() =>
      expect(screen.getAllByRole('spinbutton', { name: '输入单价', exact: true })[0]).toHaveValue(
        3,
      ),
    )
    expect(screen.getByRole('tab', { name: '基本信息' })).toHaveAttribute('aria-selected', 'false')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: '取消', exact: true }))
    expect(confirm).toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '保存更改' }))
    await waitFor(() => expect(submit).toHaveBeenCalled())
    expect(instanceFormToPayload(submit.mock.calls[0][0]).costPer1kTokens?.input).toBe(3)
    confirm.mockRestore()
  })
})
