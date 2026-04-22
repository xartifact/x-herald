'use client'

import { Plus, Search } from 'lucide-react'

import { useProviders } from '@/features/providers/useProviders'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { Input } from '@/ui/input'

import { ModelGroupCard, ModelGroupForm, ModelInstanceForm, UngroupedInstancesSection } from './components'
import { useModelGroupPage } from './useModelGroupPage'

export default function ModelGroupsPage() {
  const {
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
    instancesLoading,
    instancesByGroup,
    ungroupedInstances,
    filteredGroups,
    groupForm,
    instanceForm,
    groupSubmitPending,
    instanceSubmitPending,
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
  } = useModelGroupPage()

  const { data: providers = [] } = useProviders()

  const getProviderName = (providerId: string) => {
    return providers.find((p) => p.id === providerId)?.name || '未知供应商'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">模型组管理</h2>
          <p className="text-muted-foreground">管理模型组和模型实例配置</p>
        </div>
      </div>

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
            <div className="text-center text-muted-foreground">加载中...</div>
          </CardContent>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                {searchQuery ? '没有找到匹配的模型组' : '还没有模型组'}
              </p>
              {!searchQuery && (
                <Button onClick={handleAddGroup} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  添加第一个模型组
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
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
              onAddInstance={() => handleAddInstance(group.id)}
              onEditInstance={handleEditInstance}
              onDeleteInstance={handleDeleteInstance}
              onToggleInstance={handleToggleInstance}
              onMoveInstance={(instanceId, direction) => handleMoveInstance(group.id, instanceId, direction)}
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
        form={groupForm}
        editingId={editingGroupId}
        isPending={groupSubmitPending}
        onSubmit={onGroupSubmit}
      />

      <ModelInstanceForm
        open={instanceDialogOpen}
        onOpenChange={setInstanceDialogOpen}
        form={instanceForm}
        editingId={editingInstanceId}
        isPending={instanceSubmitPending}
        groups={groups}
        providers={providers}
        onSubmit={onInstanceSubmit}
      />
    </div>
  )
}
