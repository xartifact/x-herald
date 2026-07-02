'use client'

import { useState, useMemo, useCallback } from 'react'

import { useForm } from 'react-hook-form'

import type { InstanceFormData } from '@xartifact/x-llm-gateway-ui'
import type { ModelInstance } from '@xartifact/x-llm-gateway-shared'
import {
  useModelInstances,
  useCreateModelInstance,
  useUpdateModelInstance,
  useDeleteModelInstance,
  useToggleModelInstance,
  useReorderInstances,
} from './use-model-groups'

interface ExtendedModelInstance extends ModelInstance {
  groupIds?: string[]
}

export function useGroupPageInstances() {
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null)
  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false)

  const { data: rawInstances = [], isLoading: instancesLoading } = useModelInstances()
  const instances = rawInstances as ExtendedModelInstance[]
  const createInstance = useCreateModelInstance()
  const updateInstance = useUpdateModelInstance()
  const deleteInstance = useDeleteModelInstance()
  const toggleInstance = useToggleModelInstance()
  const reorderInstances = useReorderInstances()

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

  const instancesByGroup = useMemo(() => {
    const map = new Map<string, ModelInstance[]>()
    for (const instance of instances) {
      for (const gid of instance.groupIds ?? []) {
        const list = map.get(gid) || []
        list.push(instance)
        map.set(gid, list)
      }
    }
    for (const [key, list] of map) {
      map.set(
        key,
        list.toSorted((a, b) => a.priority - b.priority),
      )
    }
    return map
  }, [instances])

  const ungroupedInstances = useMemo(
    () => instances.filter((i) => !i.groupIds?.length).sort((a, b) => a.priority - b.priority),
    [instances],
  )

  const handleAddInstance = () => {
    setEditingInstanceId(null)
    instanceForm.reset({
      providerId: '',
      name: '',
      actualModelName: '',
      description: '',
      weight: 100,
      priority: 0,
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

  const handleMoveInstance = useCallback(
    (groupId: string, instanceId: string, direction: 'up' | 'down') => {
      const groupInstances = instancesByGroup.get(groupId)
      if (!groupInstances) return
      const index = groupInstances.findIndex((i) => i.id === instanceId)
      if (index === -1) return
      if (direction === 'up' && index === 0) return
      if (direction === 'down' && index === groupInstances.length - 1) return
      const swapIndex = direction === 'up' ? index - 1 : index + 1
      const newOrder = [...groupInstances]
      ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
      reorderInstances.mutate(newOrder.map((i) => i.id))
    },
    [instancesByGroup, reorderInstances],
  )

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
    instances,
    instancesLoading,
    instancesByGroup,
    ungroupedInstances,
    editingInstanceId,
    instanceDialogOpen,
    setInstanceDialogOpen,
    instanceForm,
    instanceSubmitPending: createInstance.isPending || updateInstance.isPending,
    handleAddInstance,
    handleEditInstance,
    handleDeleteInstance,
    handleToggleInstance,
    handleMoveInstance,
    onInstanceSubmit,
  }
}
