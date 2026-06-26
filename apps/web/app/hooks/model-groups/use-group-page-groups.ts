'use client'

import { useState } from 'react'

import { useForm } from 'react-hook-form'

import type { GroupFormData } from '@x-llm-gateway/ui'
import type { ModelGroup } from '@x-llm-gateway/shared'
import { useModelGroups, useCreateModelGroup, useUpdateModelGroup, useDeleteModelGroup } from './use-model-groups'

export function useGroupPageGroups() {
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)

  const { data: groups = [], isLoading: groupsLoading } = useModelGroups()
  const createGroup = useCreateModelGroup()
  const updateGroup = useUpdateModelGroup()
  const deleteGroup = useDeleteModelGroup()

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
    if (!confirm(`确定要删除模型组 "${name}" 吗？

此操作不可撤销。`)) return
    await deleteGroup.mutateAsync(id)
  }

  const onGroupSubmit = async (data: GroupFormData) => {
    const aliases = data.aliases ? data.aliases.split(',').map((s) => s.trim()).filter(Boolean) : []
    const payload = {
      name: data.name,
      aliases,
      displayName: data.displayName,
      description: data.description,
      category: data.category,
      capabilities: data.capabilities,
      routingConfig: { strategy: data.routingStrategy, fallbackEnabled: data.fallbackEnabled },
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

  return {
    groups,
    groupsLoading,
    editingGroupId,
    groupDialogOpen,
    setGroupDialogOpen,
    groupForm,
    groupSubmitPending: createGroup.isPending || updateGroup.isPending,
    handleAddGroup,
    handleEditGroup,
    handleDeleteGroup,
    onGroupSubmit,
  }
}
