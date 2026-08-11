import { useState, useMemo } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import type { ProtocolsConfig } from '@xartifact/x-llm-gateway-shared'
import { useProviderInstanceState } from './use-provider-instance-state'
import {
  useProviders,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
  useToggleProvider,
} from './use-providers'
import {
  PROTOCOL_OPTIONS,
  providerSchema,
  type ProviderFormData,
} from '@xartifact/x-llm-gateway-shared'

type ProtocolType = (typeof PROTOCOL_OPTIONS)[number]['value']

export function useProviderPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [showFormApiKey, setShowFormApiKey] = useState(false)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)

  const { data: providers = [], isLoading: loading } = useProviders()
  const createProvider = useCreateProvider()
  const updateProvider = useUpdateProvider()
  const deleteProvider = useDeleteProvider()
  const toggleProvider = useToggleProvider()

  const instanceState = useProviderInstanceState()

  const form = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema as any),
    defaultValues: {
      name: '',
      apiKey: '',
      enabled: true,
      protocols: {
        openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' },
        anthropic: { enabled: false, baseUrl: 'https://api.anthropic.com/v1' },
        gemini: { enabled: false, baseUrl: 'https://generativelanguage.googleapis.com/v1' },
      },
    },
  })

  const editingProvider = editingProviderId
    ? providers.find((p) => p.id === editingProviderId)
    : null
  const filteredProviders = useMemo(
    () => providers.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [providers, searchQuery],
  )

  const onSubmit = async (data: ProviderFormData) => {
    const enabledProtocols: ProtocolsConfig = {}
    Object.entries(data.protocols).forEach(([key, value]) => {
      if (value?.enabled && value.baseUrl) {
        enabledProtocols[key as ProtocolType] = {
          baseUrl: value.baseUrl,
          enabled: true,
          ...(value.toolSchemaSanitization && { toolSchemaSanitization: true }),
        }
      }
    })
    const payload = {
      name: data.name,
      apiKey: data.apiKey || undefined,
      protocols: enabledProtocols,
      enabled: data.enabled,
    }
    if (editingProviderId) {
      await updateProvider.mutateAsync({ id: editingProviderId, data: payload })
    } else {
      await createProvider.mutateAsync(payload)
    }
    setDialogOpen(false)
    setEditingProviderId(null)
    form.reset()
  }

  const handleEdit = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId)
    if (!provider) return
    setEditingProviderId(providerId)
    form.reset({
      name: provider.name,
      apiKey: provider.apiKey || '',
      enabled: provider.enabled,
      protocols: {
        openai: provider.protocols.openai
          ? {
              enabled: true,
              baseUrl: provider.protocols.openai.baseUrl,
              toolSchemaSanitization: provider.protocols.openai.toolSchemaSanitization ?? false,
            }
          : { enabled: false, baseUrl: 'https://api.openai.com/v1' },
        anthropic: provider.protocols.anthropic
          ? {
              enabled: true,
              baseUrl: provider.protocols.anthropic.baseUrl,
              toolSchemaSanitization: provider.protocols.anthropic.toolSchemaSanitization ?? false,
            }
          : { enabled: false, baseUrl: 'https://api.anthropic.com/v1' },
        gemini: provider.protocols.gemini
          ? {
              enabled: true,
              baseUrl: provider.protocols.gemini.baseUrl,
              toolSchemaSanitization: provider.protocols.gemini.toolSchemaSanitization ?? false,
            }
          : { enabled: false, baseUrl: 'https://generativelanguage.googleapis.com/v1' },
      },
    })
    setShowFormApiKey(false)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除供应商 "${name}" 吗？\n\n此操作不可撤销。`)) return
    await deleteProvider.mutateAsync(id)
  }

  const handleToggle = (id: string) => {
    toggleProvider.mutate(id)
  }
  const toggleShowApiKey = (providerId: string) => {
    setShowApiKey((prev) => ({ ...prev, [providerId]: !prev[providerId] }))
  }
  const handleAddNew = () => {
    setEditingProviderId(null)
    setShowFormApiKey(false)
    form.reset({
      name: '',
      apiKey: '',
      enabled: true,
      protocols: {
        openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' },
        anthropic: { enabled: false, baseUrl: 'https://api.anthropic.com/v1' },
        gemini: { enabled: false, baseUrl: 'https://generativelanguage.googleapis.com/v1' },
      },
    })
    setDialogOpen(true)
  }

  return {
    providers,
    loading,
    filteredProviders,
    dialogOpen,
    setDialogOpen,
    editingProviderId,
    editingProvider,
    searchQuery,
    setSearchQuery,
    showApiKey,
    showFormApiKey,
    setShowFormApiKey,
    isSubmitting: createProvider.isPending || updateProvider.isPending,
    form,
    PROTOCOL_OPTIONS,
    onSubmit,
    handleEdit,
    handleDelete,
    handleToggle,
    handleAddNew,
    toggleShowApiKey,
    expandedProvider,
    setExpandedProvider,
    ...instanceState,
  }
}
