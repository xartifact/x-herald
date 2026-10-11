import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  useProviders,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
  useToggleProvider,
  useProviderInstanceState,
  useProviderDialogState,
  providerSchema,
} from '@xartifact/x-herald-ui'
import type { ProviderFormData } from '@xartifact/x-herald-ui'
import { useProviderActions } from './provider-management-actions'

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

function useProviderData(searchQuery: string) {
  const { data: providers = [], isLoading, error, refetch } = useProviders()
  const filtered = searchQuery
    ? providers.filter((provider) =>
        provider.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : providers
  const createMut = useCreateProvider()
  const updateMut = useUpdateProvider()
  const deleteMut = useDeleteProvider()
  const toggleMut = useToggleProvider()
  const instanceState = useProviderInstanceState()
  const dialogState = useProviderDialogState()
  return {
    providers,
    filtered,
    isLoading,
    error,
    refetch,
    createMut,
    updateMut,
    deleteMut,
    toggleMut,
    instanceState,
    dialogState,
  }
}

export function useProviderManagement() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [showApiKeyForm, setShowApiKeyForm] = useState(false)
  const form = useForm<ProviderFormData>({ defaultValues, resolver: zodResolver(providerSchema) })
  const data = useProviderData(searchQuery)
  const actions = useProviderActions({
    providers: data.providers,
    form,
    editId,
    setEditId,
    setDialogOpen,
    setShowApiKeyForm,
    createMut: data.createMut,
    updateMut: data.updateMut,
    deleteMut: data.deleteMut,
  })
  const { dialogState, instanceState } = data
  return {
    ...data,
    ...instanceState,
    ...dialogState,
    ...actions,
    dialogOpen,
    setDialogOpen,
    editId,
    searchQuery,
    setSearchQuery,
    expandedProvider,
    setExpandedProvider,
    showApiKey,
    setShowApiKey,
    showApiKeyForm,
    setShowApiKeyForm,
    form,
    openSyncModels: dialogState.handleSyncModels,
  }
}
