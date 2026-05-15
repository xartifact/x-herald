'use client'

import { useState } from 'react'

import { useForm } from 'react-hook-form'

import type { AccessModel } from './types'
import {
  useAccessModels,
  useCreateAccessModel,
  useUpdateAccessModel,
  useDeleteAccessModel,
  useToggleAccessModel,
} from './useAccessModels'

export interface AccessModelFormData {
  name: string
  displayName: string
  description: string
  enabled: boolean
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
    },
  })

  const handleAdd = () => {
    setEditingId(null)
    form.reset({
      name: '',
      displayName: '',
      description: '',
      enabled: true,
    })
    setDialogOpen(true)
  }

  const handleEdit = (am: AccessModel) => {
    setEditingId(am.id)
    form.reset({
      name: am.name,
      displayName: am.displayName || '',
      description: am.description || '',
      enabled: am.enabled,
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
      (am.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
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
