'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useProviders, useCreateProvider, useUpdateProvider, useDeleteProvider } from './useProviders'
import type { ProtocolsConfig } from './types'

const PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI', defaultUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1' },
  { value: 'gemini', label: 'Google Gemini', defaultUrl: 'https://generativelanguage.googleapis.com/v1' },
] as const

type ProtocolType = (typeof PROTOCOL_OPTIONS)[number]['value']

const providerSchema = z.object({
  name: z.string().min(2, '名称至少需要 2 个字符'),
  apiKey: z.string().optional(),
  enabled: z.boolean(),
  protocols: z
    .object({
      openai: z
        .object({
          enabled: z.boolean(),
          baseUrl: z.string().url('请输入有效的 URL').optional(),
        })
        .optional(),
      anthropic: z
        .object({
          enabled: z.boolean(),
          baseUrl: z.string().url('请输入有效的 URL').optional(),
        })
        .optional(),
      gemini: z
        .object({
          enabled: z.boolean(),
          baseUrl: z.string().url('请输入有效的 URL').optional(),
        })
        .optional(),
    })
    .refine(
      (protocols) => {
        return Object.values(protocols).some((p) => p?.enabled)
      },
      {
        message: '至少需要启用一个协议',
      },
    ),
})

type ProviderFormData = z.infer<typeof providerSchema>

export function useProviderPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [showFormApiKey, setShowFormApiKey] = useState(false)

  const { data: providers = [], isLoading: loading } = useProviders()
  const createProvider = useCreateProvider()
  const updateProvider = useUpdateProvider()
  const deleteProvider = useDeleteProvider()

  const form = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
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

  const onSubmit = async (data: ProviderFormData) => {
    const enabledProtocols: ProtocolsConfig = {}
    Object.entries(data.protocols).forEach(([key, value]) => {
      if (value?.enabled && value.baseUrl) {
        enabledProtocols[key as ProtocolType] = {
          baseUrl: value.baseUrl,
          enabled: true,
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
      await updateProvider.mutateAsync({
        id: editingProviderId,
        data: payload,
      })
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

    const protocols: ProviderFormData['protocols'] = {
      openai: provider.protocols.openai
        ? { enabled: true, baseUrl: provider.protocols.openai.baseUrl }
        : { enabled: false, baseUrl: 'https://api.openai.com/v1' },
      anthropic: provider.protocols.anthropic
        ? { enabled: true, baseUrl: provider.protocols.anthropic.baseUrl }
        : { enabled: false, baseUrl: 'https://api.anthropic.com/v1' },
      gemini: provider.protocols.gemini
        ? { enabled: true, baseUrl: provider.protocols.gemini.baseUrl }
        : { enabled: false, baseUrl: 'https://generativelanguage.googleapis.com/v1' },
    }

    form.reset({
      name: provider.name,
      apiKey: provider.apiKey || '',
      enabled: provider.enabled,
      protocols,
    })
    setShowFormApiKey(false)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除供应商 "${name}" 吗？\n\n此操作不可撤销。`)) return
    await deleteProvider.mutateAsync(id)
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

  const toggleShowApiKey = (providerId: string) => {
    setShowApiKey((prev) => ({
      ...prev,
      [providerId]: !prev[providerId],
    }))
  }

  const filteredProviders = providers.filter((provider) =>
    provider.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

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
    handleAddNew,
    toggleShowApiKey,
  }
}
