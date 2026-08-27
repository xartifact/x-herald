import { useState, useMemo, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2, Plus, Search } from 'lucide-react'

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
} from '../../../hooks/model-groups'
import { useProviders } from '../../../hooks/providers'
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  ModelGroupCard,
  ModelGroupForm,
  ModelInstanceForm,
  PageHeader,
  UngroupedInstancesSection,
} from '@xartifact/x-herald-ui'

import type { ModelGroup, ModelInstance } from '@xartifact/x-herald-shared'

export function ModelGroupsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)

  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null)
  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false)

  const { data: groups = [], isLoading: groupsLoading } = useModelGroups()
  const { data: rawInstances = [], isLoading: instancesLoading } = useModelInstances()
  const { data: providers = [] } = useProviders()
  const instances = rawInstances as ModelInstance[]

  const createGroup = useCreateModelGroup()
  const updateGroup = useUpdateModelGroup()
  const deleteGroup = useDeleteModelGroup()

  const createInstance = useCreateModelInstance()
  const updateInstance = useUpdateModelInstance()
  const deleteInstance = useDeleteModelInstance()
  const toggleInstance = useToggleModelInstance()
  const reorderInstances = useReorderInstances()

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (group.displayName?.toLowerCase() || '').includes(searchQuery.toLowerCase()),
      ),
    [groups, searchQuery],
  )

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
      list.sort((a, b) => (a.groupPriorities?.[gid] ?? 0) - (b.groupPriorities?.[gid] ?? 0))
    }
    return map
  }, [instances])
  const allGroupedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [, list] of instancesByGroup) {
      for (const inst of list) ids.add(inst.id)
    }
    return ids
  }, [instancesByGroup])

  const ungroupedInstances = useMemo(
    () =>
      (instances as any[])
        .filter((inst) => !allGroupedIds.has(inst.id))
        .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [instances, allGroupedIds],
  )

  const groupForm = useForm({
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

  const instanceForm = useForm({
    defaultValues: {
      providerId: '',
      name: '',
      actualModelName: '',
      description: '',
      weight: 100,
      groupIds: [] as string[],
      costPer1kTokens: { _enabled: false },
      config: { capabilityOverrides: {} },
    },
  })

  const getProviderName = (providerId: string) => {
    return providers.find((p) => p.id === providerId)?.name || '未知供应商'
  }

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
      category: (group.category as any) || 'chat',
      capabilities: group.capabilities || {
        streaming: true,
        functionCalling: false,
        vision: false,
        jsonMode: false,
        maxTokens: 4096,
        contextWindow: 8192,
      },
      routingStrategy: group.routingConfig?.strategy ?? 'smart',
      fallbackEnabled: group.routingConfig?.fallbackEnabled ?? true,
    })
    setGroupDialogOpen(true)
  }

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!confirm(`确定要删除模型组 "${name}" 吗？\n\n此操作不可撤销。`)) return
    await deleteGroup.mutateAsync(id)
  }

  const onGroupSubmit = async (data: Record<string, any>) => {
    const aliases = data.aliases
      ? data.aliases
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
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

  const handleAddInstance = () => {
    instanceForm.reset({
      providerId: '',
      name: '',
      actualModelName: '',
      description: '',
      weight: 100,
      groupIds: [],
      config: { capabilityOverrides: {} },
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
      groupIds: instance.groupIds ?? [],
      costPer1kTokens: {
        ...((instance.costPer1kTokens ?? {}) as Record<string, unknown>),
        _enabled: !!instance.costPer1kTokens,
      },
      config: instance.config as any,
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
      reorderInstances.mutate({ groupId, instanceIds: newOrder.map((i) => i.id) })
    },
    [instancesByGroup, reorderInstances],
  )

  const onInstanceSubmit = async (data: Record<string, any>) => {
    // 剥离 _enabled 开关字段，只在 costPer1kTokens._enabled 为 true 时发送
    const costRaw = data.costPer1kTokens as Record<string, unknown> | undefined
    const costEnabled = costRaw?._enabled === true
    const { _enabled, ...costData } = costRaw ?? {}

    // 清理 capabilityOverrides 中的 undefined 值（避免覆盖组级配置为 undefined）
    const config = data.config as Record<string, unknown> | undefined
    if (config?.capabilityOverrides) {
      const overrides = config.capabilityOverrides as Record<string, unknown>
      Object.keys(overrides).forEach((k) => {
        if (overrides[k] === undefined) delete overrides[k]
      })
    }

    const payload = {
      providerId: data.providerId,
      name: data.name,
      actualModelName: data.actualModelName,
      description: data.description,
      weight: data.weight,
      groupIds: data.groupIds ?? [],
      costPer1kTokens: costEnabled ? (costData as any) : undefined,
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

  return (
    <div className="space-y-6">
      <PageHeader title="模型组管理" description="管理模型组和模型实例配置" />

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索模型组..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={handleAddGroup}>
          <Plus className="mr-2 h-4 w-4" />
          添加模型组
        </Button>
      </div>

      {groupsLoading || instancesLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          </CardContent>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <EmptyState
          searchQuery={searchQuery}
          action={
            !searchQuery ? (
              <Button onClick={handleAddGroup} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                添加第一个模型组
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <ModelGroupCard
              key={group.id}
              group={group}
              instances={instancesByGroup.get(group.id) || []}
              isExpanded={expandedGroup === group.id}
              onToggleExpand={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
              onEdit={() => handleEditGroup(group)}
              onDelete={() => handleDeleteGroup(group.id, group.name)}
              onAddInstance={handleAddInstance}
              onEditInstance={handleEditInstance}
              onDeleteInstance={handleDeleteInstance}
              onToggleInstance={handleToggleInstance}
              onMoveInstance={(instanceId, direction) =>
                handleMoveInstance(group.id, instanceId, direction)
              }
              getProviderName={getProviderName}
            />
          ))}
          <UngroupedInstancesSection
            instances={ungroupedInstances}
            groups={groups}
            getProviderName={getProviderName}
          />
        </div>
      )}

      <ModelGroupForm
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        form={groupForm as any}
        editingId={editingGroupId}
        isPending={createGroup.isPending || updateGroup.isPending}
        onSubmit={onGroupSubmit}
      />
      <ModelInstanceForm
        open={instanceDialogOpen}
        onOpenChange={setInstanceDialogOpen}
        form={instanceForm as any}
        editingId={editingInstanceId}
        isPending={createInstance.isPending || updateInstance.isPending}
        providers={providers}
        groups={groups}
        onSubmit={onInstanceSubmit}
      />
    </div>
  )
}
