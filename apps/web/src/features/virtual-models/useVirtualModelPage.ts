'use client'

import { useState } from 'react'

import { useForm } from 'react-hook-form'

import type { VirtualModel } from './types'
import {
  useVirtualModels,
  useCreateVirtualModel,
  useUpdateVirtualModel,
  useDeleteVirtualModel,
  useToggleVirtualModel,
} from './useVirtualModels'

export interface VirtualModelFormData {
  name: string
  displayName: string
  description: string
  enabled: boolean
}

export function useVirtualModelPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: virtualModels = [], isLoading } = useVirtualModels()
  const createVM = useCreateVirtualModel()
  const updateVM = useUpdateVirtualModel()
  const deleteVM = useDeleteVirtualModel()
  const toggleVM = useToggleVirtualModel()

  const form = useForm<VirtualModelFormData>({
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

  const handleEdit = (vm: VirtualModel) => {
    setEditingId(vm.id)
    form.reset({
      name: vm.name,
      displayName: vm.displayName || '',
      description: vm.description || '',
      enabled: vm.enabled,
    })
    setDialogOpen(true)
  }

  const handleDelete = async (vm: VirtualModel) => {
    if (!confirm(`确定要删除虚拟模型 "${vm.name}" 吗？`)) return
    await deleteVM.mutateAsync(vm.id)
  }

  const handleToggle = async (id: string) => {
    await toggleVM.mutateAsync(id)
  }

  const onSubmit = async (data: VirtualModelFormData) => {
    const payload = {
      name: data.name,
      displayName: data.displayName || undefined,
      description: data.description || undefined,
      enabled: data.enabled,
    }

    if (editingId) {
      await updateVM.mutateAsync({ id: editingId, data: payload })
    } else {
      await createVM.mutateAsync(payload)
    }
    setDialogOpen(false)
    setEditingId(null)
    form.reset()
  }

  const filteredModels = virtualModels.filter(
    (vm) =>
      vm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (vm.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return {
    searchQuery,
    setSearchQuery,
    dialogOpen,
    setDialogOpen,
    editingId,
    isLoading,
    virtualModels,
    filteredModels,
    form,
    submitPending: createVM.isPending || updateVM.isPending,
    handleAdd,
    handleEdit,
    handleDelete,
    handleToggle,
    onSubmit,
  }
}
