'use client'

import { useState, useMemo, useCallback } from 'react'

import { useForm } from 'react-hook-form'

import type { GroupFormData, InstanceFormData } from './form-types'
import type { ModelGroup, ModelInstance } from './types'
import {
  useModelGroups,
  useModelInstances,
  useCreateModelGroup,
  useUpdateModelGroup,
  useDeleteModelGroup,
  useCreateModelInstance,
  useUpdateModelInstance,
  useDeleteModelInstance,
  useToggleModelInstance,
  useReorderInstances,
} from './useModelGroups'

export function useModelGroupPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null)

  const { data: groups = [], isLoading: groupsLoading } = useModelGroups()
  const { data: instances = [], isLoading: instancesLoading } = useModelInstances()

  const createGroup = useCreateModelGroup()
  const updateGroup = useUpdateModelGroup()
  const deleteGroup = useDeleteModelGroup()
  const createInstance = useCreateModelInstance()
  const updateInstance = useUpdateModelInstance()
  const deleteInstance = useDeleteModelInstance()
  const toggleInstance = useToggleModelInstance()
  const reorderInstances = useReorderInstances()

  const groupForm = useForm<GroupFormData>({
    defaultValues: {
      name: '',
      aliases: '',
      displayName: '',
      description: '',
      category: 'chat',
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
        jsonMode: false,
        maxTokens: 4096,
        contextWindow: 8192,
      },
      routingStrategy: 'smart',
      fallbackEnabled: true,
    },
  })

  const instanceForm = useForm<InstanceFormData>({
    defaultValues: {
      groupId: '',
      providerId: '',
      name: '',
      actualModelName: '',
      description: '',
      weight: 100,
      priority: 0,
      config: undefined,
    },
  })

  // 按 groupId 分组实例，并按 priority 排序
  const instancesByGroup = useMemo(() => {
    const map = new Map<string, ModelInstance[]>()
    for (const instance of instances) {
      if (!instance.groupId) continue
      const list = map.get(instance.groupId) || []
      list.push(instance)
      map.set(instance.groupId, list)
    }
    // 按 priority 升序排序
    for (const [key, list] of map) {
      map.set(key, list.sort((a, b) => a.priority - b.priority))
    }
    return map
  }, [instances])

  // 未分组实例
  const ungroupedInstances = useMemo(() => {
    return instances.filter((i) => !i.groupId).sort((a, b) => a.priority - b.priority)
  }, [instances])

  const handleAddGroup = () => {
    setEditingGroupId(null)
    groupForm.reset()
    setGroupDialogOpen(true)
  }

  const handleEditGroup = (group: ModelGroup) => {
    setEditingGroupId(group.id)
    groupForm.reset({
      name: group.name,
      aliases: group.aliases?.join(', ') || '',
      displayName: group.displayName,
      description: group.description || '',
      category: group.category as GroupFormData['category'],
      capabilities: group.capabilities,
      routingStrategy: group.routingConfig?.strategy ?? 'smart',
      fallbackEnabled: group.routingConfig?.fallbackEnabled ?? true,
    })
    setGroupDialogOpen(true)
  }

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!confirm(`确定要删除模型组 "${name}" 吗？\n\n此操作不可撤销。`)) return
    await deleteGroup.mutateAsync(id)
  }

  const handleAddInstance = (groupId?: string) => {
    setEditingInstanceId(null)
    instanceForm.reset({
      groupId: groupId || '',
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
      groupId: instance.groupId || '',
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
    await deleteInstance.mutateAsync({ id: instance.id, groupId: instance.groupId || '' })
  }

  const handleToggleInstance = (instance: ModelInstance) => {
    toggleInstance.mutate({ id: instance.id, groupId: instance.groupId || '' })
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

      const instanceIds = newOrder.map((i) => i.id)
      reorderInstances.mutate(instanceIds)
    },
    [instancesByGroup, reorderInstances]
  )

  const onGroupSubmit = async (data: GroupFormData) => {
    // 解析别名：逗号分隔的字符串转数组
    const aliases = data.aliases
      ? data.aliases.split(',').map(s => s.trim()).filter(Boolean)
      : []

    const payload = {
      name: data.name,
      aliases,
      displayName: data.displayName,
      description: data.description,
      category: data.category,
      capabilities: data.capabilities,
      routingConfig: {
        strategy: data.routingStrategy,
        fallbackEnabled: data.fallbackEnabled,
      },
    }
    if (editingGroupId) {
      await updateGroup.mutateAsync({ id: editingGroupId, data: payload })
    } else {
      await createGroup.mutateAsync(payload)
    }
    setGroupDialogOpen(false)
    setEditingGroupId(null)
    groupForm.reset()
  }

  const onInstanceSubmit = async (data: InstanceFormData) => {
    const payload = {
      groupId: data.groupId || null,
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
        groupId: data.groupId,
        data: payload,
      })
    } else {
      await createInstance.mutateAsync(payload)
    }
    setInstanceDialogOpen(false)
    setEditingInstanceId(null)
    instanceForm.reset()
  }

  const filteredGroups = groups.filter(
    (group) =>
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return {
    searchQuery,
    setSearchQuery,
    expandedGroup,
    setExpandedGroup,
    groupDialogOpen,
    setGroupDialogOpen,
    instanceDialogOpen,
    setInstanceDialogOpen,
    editingGroupId,
    editingInstanceId,
    groups,
    groupsLoading,
    instances,
    instancesLoading,
    instancesByGroup,
    ungroupedInstances,
    filteredGroups,
    groupForm,
    instanceForm,
    groupSubmitPending: createGroup.isPending || updateGroup.isPending,
    instanceSubmitPending: createInstance.isPending || updateInstance.isPending,
    handleAddGroup,
    handleEditGroup,
    handleDeleteGroup,
    handleAddInstance,
    handleEditInstance,
    handleDeleteInstance,
    handleToggleInstance,
    handleMoveInstance,
    onGroupSubmit,
    onInstanceSubmit,
  }
}
