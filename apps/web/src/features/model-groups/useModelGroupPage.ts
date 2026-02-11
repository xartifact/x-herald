'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  useModelGroups,
  useModelInstances,
  useCreateModelGroup,
  useUpdateModelGroup,
  useDeleteModelGroup,
  useCreateModelInstance,
  useUpdateModelInstance,
  useDeleteModelInstance,
} from './useModelGroups'
import type { GroupFormData, InstanceFormData } from './form-types'
import type { ModelGroup, ModelInstance } from './types'

export function useModelGroupPage() {
  const [activeTab, setActiveTab] = useState('groups')
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
      routingStrategy: group.routingConfig.strategy as GroupFormData['routingStrategy'],
      fallbackEnabled: group.routingConfig.fallbackEnabled,
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
      groupId: instance.groupId,
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
    await deleteInstance.mutateAsync({ id: instance.id, groupId: instance.groupId })
  }

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
      groupId: data.groupId,
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
    activeTab,
    setActiveTab,
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
    onGroupSubmit,
    onInstanceSubmit,
  }
}
