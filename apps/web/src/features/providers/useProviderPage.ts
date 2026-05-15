'use client'

import { useState, useMemo, useCallback } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import type { InstanceFormData } from '@/features/model-groups/form-types'
import type { ModelInstance } from '@/features/model-groups/types'
import {
  useModelInstances,
  useModelGroups,
  useCreateModelInstance,
  useUpdateModelInstance,
  useDeleteModelInstance,
  useToggleModelInstance,
} from '@/features/model-groups/useModelGroups'

import type { ProtocolsConfig } from './types'
import { useProviders, useCreateProvider, useUpdateProvider, useDeleteProvider, useToggleProvider } from './useProviders'


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
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false)
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null)

  const { data: providers = [], isLoading: loading } = useProviders()
  const createProvider = useCreateProvider()
  const updateProvider = useUpdateProvider()
  const deleteProvider = useDeleteProvider()
  const toggleProvider = useToggleProvider()

  const { data: instances = [] } = useModelInstances()
  const { data: groups = [] } = useModelGroups()
  const createInstance = useCreateModelInstance()
  const updateInstance = useUpdateModelInstance()
  const deleteInstance = useDeleteModelInstance()
  const toggleInstance = useToggleModelInstance()

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

  const instanceForm = useForm<InstanceFormData>({
    defaultValues: {
      providerId: '',
      name: '',
      actualModelName: '',
      description: '',
      weight: 100,
      priority: 0,
      config: undefined,
    },
  })

  // 按 providerId 分组实例
  const instancesByProvider = useMemo(() => {
    const map = new Map<string, ModelInstance[]>()
    for (const instance of instances) {
      const list = map.get(instance.providerId) || []
      list.push(instance)
      map.set(instance.providerId, list)
    }
    return map
  }, [instances])

  const getGroupName = useCallback(
    (groupId: string | null): string => {
      if (!groupId) return '-'
      const group = groups.find((g) => g.id === groupId)
      return group?.displayName || group?.name || groupId
    },
    [groups],
  )

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

  const handleToggle = (id: string) => {
    toggleProvider.mutate(id)
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

  // 实例操作
  const handleAddInstance = (providerId: string) => {
    setEditingInstanceId(null)
    instanceForm.reset({
      providerId,
      name: '',
      actualModelName: '',
      description: '',
      weight: 100,
      priority: 0,
      config: undefined,
    })
    setInstanceDialogOpen(true)
  }

  const handleEditInstance = (instance: ModelInstance) => {
    setEditingInstanceId(instance.id)
    instanceForm.reset({
      providerId: instance.providerId,
      name: instance.name,
      actualModelName: instance.actualModelName,
      description: instance.description || '',
      weight: instance.weight,
      priority: instance.priority,
      config: instance.config || undefined,
    })
    setInstanceDialogOpen(true)
  }

  const handleDeleteInstance = async (instance: ModelInstance) => {
    if (!confirm(`确定要删除模型实例 "${instance.name}" 吗？`)) return
    await deleteInstance.mutateAsync({ id: instance.id })
  }

  const handleToggleInstance = (instance: ModelInstance) => {
    toggleInstance.mutate({ id: instance.id })
  }

  const onInstanceSubmit = async (data: InstanceFormData) => {
    const payload = {
      providerId: data.providerId,
      name: data.name,
      actualModelName: data.actualModelName,
      description: data.description,
      weight: data.weight,
      priority: data.priority,
      config: data.config,
    }
    if (editingInstanceId) {
      await updateInstance.mutateAsync({
        id: editingInstanceId,
        data: payload,
      })
    } else {
      await createInstance.mutateAsync(payload)
    }
    setInstanceDialogOpen(false)
    setEditingInstanceId(null)
    instanceForm.reset()
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
    handleToggle,
    handleAddNew,
    toggleShowApiKey,
    // 实例相关
    groups,
    instancesByProvider,
    expandedProvider,
    setExpandedProvider,
    instanceDialogOpen,
    setInstanceDialogOpen,
    editingInstanceId,
    instanceForm,
    instanceSubmitPending: createInstance.isPending || updateInstance.isPending,
    getGroupName,
    handleAddInstance,
    handleEditInstance,
    handleDeleteInstance,
    handleToggleInstance,
    onInstanceSubmit,
  }
}
