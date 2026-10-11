import { useCallback } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useCreateProvider, useDeleteProvider, useUpdateProvider } from '@xartifact/x-herald-ui'
import type { ProviderFormData } from '@xartifact/x-herald-ui'
import type { Provider } from '@xartifact/x-herald-shared'

const defaultValues: ProviderFormData = {
  name: '',
  apiKey: '',
  enabled: true,
  protocols: {
    openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' },
    anthropic: { enabled: false, baseUrl: '' },
    gemini: { enabled: false, baseUrl: '' },
    jev: { enabled: false, baseUrl: 'https://api.typesafe.ai' },
  },
}

function providerToForm(provider: Provider): ProviderFormData {
  return {
    name: provider.name,
    apiKey: '',
    enabled: provider.enabled,
    protocols: {
      openai: {
        enabled: !!provider.protocols.openai?.enabled,
        baseUrl: provider.protocols.openai?.baseUrl ?? '',
        toolSchemaSanitization: provider.protocols.openai?.toolSchemaSanitization ?? false,
      },
      anthropic: {
        enabled: !!provider.protocols.anthropic?.enabled,
        baseUrl: provider.protocols.anthropic?.baseUrl ?? '',
        toolSchemaSanitization: provider.protocols.anthropic?.toolSchemaSanitization ?? false,
      },
      gemini: {
        enabled: !!provider.protocols.gemini?.enabled,
        baseUrl: provider.protocols.gemini?.baseUrl ?? '',
        toolSchemaSanitization: provider.protocols.gemini?.toolSchemaSanitization ?? false,
      },
      jev: {
        enabled: !!provider.protocols.jev?.enabled,
        baseUrl: provider.protocols.jev?.baseUrl ?? 'https://api.typesafe.ai',
        toolSchemaSanitization: provider.protocols.jev?.toolSchemaSanitization ?? false,
      },
    },
  }
}

function buildProviderPayload(data: ProviderFormData, current?: Provider) {
  const protocols: Record<string, Provider['protocols'][string]> = {}
  for (const [key, value] of Object.entries(data.protocols)) {
    if (value?.enabled && value.baseUrl) {
      protocols[key] = {
        ...current?.protocols[key],
        enabled: true,
        baseUrl: value.baseUrl,
        toolSchemaSanitization: value.toolSchemaSanitization ?? false,
      }
    }
  }
  return { name: data.name, apiKey: data.apiKey || undefined, protocols, enabled: data.enabled }
}

export interface ProviderActionsOptions {
  providers: Provider[]
  form: UseFormReturn<ProviderFormData>
  editId: string | null
  setEditId: (id: string | null) => void
  setDialogOpen: (open: boolean) => void
  setShowApiKeyForm: (show: boolean) => void
  createMut: ReturnType<typeof useCreateProvider>
  updateMut: ReturnType<typeof useUpdateProvider>
  deleteMut: ReturnType<typeof useDeleteProvider>
}

export function useProviderActions({
  providers,
  form,
  editId,
  setEditId,
  setDialogOpen,
  setShowApiKeyForm,
  createMut,
  updateMut,
  deleteMut,
}: ProviderActionsOptions) {
  const handleAddNew = useCallback(() => {
    setEditId(null)
    form.reset(defaultValues)
    setShowApiKeyForm(false)
    setDialogOpen(true)
  }, [form])
  const handleEdit = useCallback(
    (id: string) => {
      const provider = providers.find((item) => item.id === id)
      if (!provider) return
      setEditId(id)
      form.reset(providerToForm(provider))
      setShowApiKeyForm(false)
      setDialogOpen(true)
    },
    [providers, form],
  )
  const handleSubmit = useCallback(
    (data: ProviderFormData) => {
      const payload = buildProviderPayload(
        data,
        providers.find((provider) => provider.id === editId),
      )
      if (editId)
        updateMut.mutate(
          { id: editId, data: payload as Partial<Provider> },
          { onSuccess: () => setDialogOpen(false) },
        )
      else
        createMut.mutate(payload as Parameters<typeof createMut.mutate>[0], {
          onSuccess: () => setDialogOpen(false),
        })
    },
    [editId, createMut, updateMut, providers],
  )
  const handleDeleteProvider = useCallback(
    (id: string) => {
      const provider = providers.find((item) => item.id === id)
      if (!provider || !confirm(`确定要删除供应商 "${provider.name}" 吗？\n\n此操作不可撤销。`))
        return
      deleteMut.mutate(id)
    },
    [providers, deleteMut],
  )
  return { handleAddNew, handleEdit, handleSubmit, handleDeleteProvider }
}
