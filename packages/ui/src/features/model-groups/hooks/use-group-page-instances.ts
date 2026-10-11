import { zodResolver } from '@hookform/resolvers/zod'
import { instanceFormSchema } from './management-form-schema'
import { useState, useMemo, useCallback } from 'react'

import { instanceToForm, instanceFormToPayload } from './instance-form-data'
import { useForm } from 'react-hook-form'

import type { InstanceFormData } from '@xartifact/x-herald-ui'
import type { ModelInstance } from '@xartifact/x-herald-shared'
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

  const {
    data: rawInstances = [],
    isLoading: instancesLoading,
    error: instancesError,
    refetch: refetchInstances,
  } = useModelInstances()
  const instances = rawInstances as ExtendedModelInstance[]
  const createInstance = useCreateModelInstance()
  const updateInstance = useUpdateModelInstance()
  const deleteInstance = useDeleteModelInstance()
  const toggleInstance = useToggleModelInstance()
  const reorderInstances = useReorderInstances()

  const instanceForm = useForm<InstanceFormData>({
    resolver: zodResolver(instanceFormSchema),
    defaultValues: instanceToForm(),
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
    for (const [gid, list] of map) {
      map.set(
        gid,
        list.toSorted((a, b) => (a.groupPriorities?.[gid] ?? 0) - (b.groupPriorities?.[gid] ?? 0)),
      )
    }
    return map
  }, [instances])

  const ungroupedInstances = useMemo(
    () =>
      instances
        .filter((i) => !i.groupIds?.length)
        .toSorted((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [instances],
  )

  const handleAddInstance = () => {
    setEditingInstanceId(null)
    instanceForm.reset(instanceToForm())
    setInstanceDialogOpen(true)
  }

  const handleEditInstance = (instance: ModelInstance) => {
    setEditingInstanceId(instance.id)
    instanceForm.reset(instanceToForm(instance))
    setInstanceDialogOpen(true)
  }

  const handleDeleteInstance = async (instance: ModelInstance) => {
    if (!confirm(`确定要删除模型实例 "${instance.name}" 吗？`)) return
    await deleteInstance.mutateAsync({ id: instance.id })
  }

  const handleToggleInstance = (instance: ModelInstance) => {
    toggleInstance.mutate({ id: instance.id })
  }

  const handleReorderInstances = useCallback(
    (groupId: string, orderedIds: string[]) => {
      reorderInstances.mutate({ groupId, instanceIds: orderedIds })
    },
    [reorderInstances],
  )

  const onInstanceSubmit = async (data: InstanceFormData) => {
    const payload = instanceFormToPayload(data)
    try {
      if (editingInstanceId) {
        await updateInstance.mutateAsync({ id: editingInstanceId, data: payload })
      } else {
        await createInstance.mutateAsync(payload)
      }
      setInstanceDialogOpen(false)
      setEditingInstanceId(null)
      instanceForm.reset()
    } catch {
      // Mutation shows the error; leave the form open for retry.
    }
  }

  return {
    instances,
    instancesLoading,
    instancesError,
    refetchInstances,
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
    handleReorderInstances,
    onInstanceSubmit,
  }
}
