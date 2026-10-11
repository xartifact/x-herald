import { useState } from 'react'
import {
  useGroupPageGroups,
  useGroupPageInstances,
  useAttachInstancesToGroup,
  useDetachInstanceFromGroup,
  useProviders,
} from '@xartifact/x-herald-ui'

export function useGroupManagement() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [pickingGroupId, setPickingGroupId] = useState<string | null>(null)
  const { data: providers = [] } = useProviders()
  const {
    groups,
    groupsLoading,
    groupForm,
    editingGroupId,
    groupDialogOpen,
    setGroupDialogOpen,
    groupSubmitPending,
    handleAddGroup,
    handleEditGroup,
    handleDeleteGroup,
    onGroupSubmit,
    groupsError,
    refetchGroups,
  } = useGroupPageGroups()
  const {
    instances,
    instancesLoading,
    instancesByGroup,
    ungroupedInstances,
    instanceForm,
    editingInstanceId,
    instanceDialogOpen,
    setInstanceDialogOpen,
    instanceSubmitPending,
    handleAddInstance,
    handleEditInstance,
    handleDeleteInstance,
    handleToggleInstance,
    handleReorderInstances,
    onInstanceSubmit,
    instancesError,
    refetchInstances,
  } = useGroupPageInstances()
  const attachInstances = useAttachInstancesToGroup()
  const detachInstance = useDetachInstanceFromGroup()
  const filteredGroups = groups.filter((group) =>
    `${group.name} ${group.displayName} ${group.description ?? ''}`
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase()),
  )
  const selectedGroup =
    filteredGroups.find((group) => group.id === expandedGroup) ?? filteredGroups[0]
  const pickingGroup = groups.find((group) => group.id === pickingGroupId) ?? null
  const getProviderName = (id: string) =>
    providers.find((provider) => provider.id === id)?.name ?? '未知供应商'

  return {
    searchQuery,
    setSearchQuery,
    expandedGroup,
    setExpandedGroup,
    pickingGroupId,
    setPickingGroupId,
    providers,
    groups,
    groupsLoading,
    groupForm,
    editingGroupId,
    groupDialogOpen,
    setGroupDialogOpen,
    groupSubmitPending,
    handleAddGroup,
    handleEditGroup,
    handleDeleteGroup,
    onGroupSubmit,
    groupsError,
    refetchGroups,
    instances,
    instancesLoading,
    instancesByGroup,
    ungroupedInstances,
    instanceForm,
    editingInstanceId,
    instanceDialogOpen,
    setInstanceDialogOpen,
    instanceSubmitPending,
    handleAddInstance,
    handleEditInstance,
    handleDeleteInstance,
    handleToggleInstance,
    handleReorderInstances,
    onInstanceSubmit,
    instancesError,
    refetchInstances,
    attachInstances,
    detachInstance,
    filteredGroups,
    selectedGroup,
    pickingGroup,
    getProviderName,
  }
}
