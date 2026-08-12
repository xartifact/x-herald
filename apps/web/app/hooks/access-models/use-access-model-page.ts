import { useState } from 'react'

import { useForm } from 'react-hook-form'

import type { AccessModel } from '@xartifact/x-herald-shared'
import {
  useAccessModels,
  useCreateAccessModel,
  useUpdateAccessModel,
  useDeleteAccessModel,
  useToggleAccessModel,
} from './use-access-models'

export interface AccessModelFormData {
  name: string
  displayName: string
  description: string
  enabled: boolean
  capabilities: {
    streaming: boolean
    functionCalling: boolean
    vision: boolean
    jsonMode: boolean
    reasoning: boolean
    contextWindow: number
    maxTokens: number
  }
}

const DEFAULT_CAPABILITIES: AccessModelFormData['capabilities'] = {
  streaming: true,
  functionCalling: true,
  vision: true,
  jsonMode: true,
  reasoning: true,
  contextWindow: 1_000_000,
  maxTokens: 0,
}

export function useAccessModelPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: accessModels = [], isLoading } = useAccessModels()
  const createAM = useCreateAccessModel()
  const updateAM = useUpdateAccessModel()
  const deleteAM = useDeleteAccessModel()
  const toggleAM = useToggleAccessModel()

  const form = useForm<AccessModelFormData>({
    defaultValues: {
      name: '',
      displayName: '',
      description: '',
      enabled: true,
      capabilities: DEFAULT_CAPABILITIES,
    },
  })

  const handleAdd = () => {
    setEditingId(null)
    form.reset({
      name: '',
      displayName: '',
      description: '',
      enabled: true,
      capabilities: DEFAULT_CAPABILITIES,
    })
    setDialogOpen(true)
  }

  const handleEdit = (am: AccessModel) => {
    setEditingId(am.id)
    const cap = am.capabilities
    form.reset({
      name: am.name,
      displayName: am.displayName || '',
      description: am.description || '',
      enabled: am.enabled,
      capabilities: cap
        ? {
            streaming: cap.streaming ?? true,
            functionCalling: cap.functionCalling ?? false,
            vision: cap.vision ?? false,
            jsonMode: cap.jsonMode ?? false,
            reasoning: Boolean(cap.reasoning),
            contextWindow: Number(cap.contextWindow ?? 0),
            maxTokens: Number(cap.maxTokens ?? 0),
          }
        : DEFAULT_CAPABILITIES,
    })
    setDialogOpen(true)
  }

  const handleDelete = async (am: AccessModel) => {
    if (!confirm(`确定要删除接入模型 "${am.name}" 吗？`)) return
    await deleteAM.mutateAsync(am.id)
  }

  const handleToggle = async (id: string) => {
    await toggleAM.mutateAsync(id)
  }

  const onSubmit = async (data: AccessModelFormData) => {
    const payload = {
      name: data.name,
      displayName: data.displayName || undefined,
      description: data.description || undefined,
      enabled: data.enabled,
      capabilities: {
        streaming: data.capabilities.streaming,
        functionCalling: data.capabilities.functionCalling,
        vision: data.capabilities.vision,
        jsonMode: data.capabilities.jsonMode,
        reasoning: data.capabilities.reasoning,
        contextWindow: data.capabilities.contextWindow,
        maxTokens: data.capabilities.maxTokens,
      },
    }

    if (editingId) {
      await updateAM.mutateAsync({ id: editingId, data: payload })
    } else {
      await createAM.mutateAsync(payload)
    }
    setDialogOpen(false)
    setEditingId(null)
    form.reset()
  }

  const filteredModels = accessModels.filter(
    (am) =>
      am.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (am.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return {
    searchQuery,
    setSearchQuery,
    dialogOpen,
    setDialogOpen,
    editingId,
    isLoading,
    accessModels,
    filteredModels,
    form,
    submitPending: createAM.isPending || updateAM.isPending,
    handleAdd,
    handleEdit,
    handleDelete,
    handleToggle,
    onSubmit,
  }
}
