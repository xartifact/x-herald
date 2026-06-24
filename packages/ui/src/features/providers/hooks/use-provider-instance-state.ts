'use client'

import { useState, useMemo, useCallback } from 'react'

import { useForm } from 'react-hook-form'

import type { InstanceFormData } from '../../../shared/lib/form-types'
import type { ModelInstance } from '@x-llm-gateway/shared'
import {
  useModelInstances,
  useModelGroups,
  useCreateModelInstance,
  useUpdateModelInstance,
  useDeleteModelInstance,
  useToggleModelInstance,
} from '../../model-groups'

export function useProviderInstanceState() {
  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false)
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null)

  const { data: instances = [] } = useModelInstances()
  const { data: groups = [] } = useModelGroups()
  const createInstance = useCreateModelInstance()
  const updateInstance = useUpdateModelInstance()
  const deleteInstance = useDeleteModelInstance()
  const toggleInstance = useToggleModelInstance()

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

  const handleAddInstance = (providerId: string) => {
    setEditingInstanceId(null)
    instanceForm.reset({ providerId, name: '', actualModelName: '', description: '', weight: 100, priority: 0, config: undefined })
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
      await updateInstance.mutateAsync({ id: editingInstanceId, data: payload })
    } else {
      await createInstance.mutateAsync(payload)
    }
    setInstanceDialogOpen(false)
    setEditingInstanceId(null)
    instanceForm.reset()
  }

  return {
    groups,
    instancesByProvider,
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
