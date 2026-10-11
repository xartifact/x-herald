import { Loader2, Plus, Search, Layers } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  InstancePickerDialog,
  ModelGroupCard,
  ModelGroupForm,
  ModelInstanceForm,
  PageHeader,
  UngroupedInstancesSection,
} from '@xartifact/x-herald-ui'
import { useGroupManagement } from '../../../components/use-group-management'

export function ModelGroupsPage() {
  const state = useGroupManagement()
  return (
    <div className="space-y-6">
      <PageHeader title="模型组管理" description="管理模型组和模型实例配置" />

      <div className="resource-toolbar flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索模型组..."
            value={state.searchQuery}
            onChange={(e) => state.setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button variant="outline" onClick={state.handleAddInstance}>
          <Plus className="mr-2 h-4 w-4" />
          新建实例
        </Button>
        <Button onClick={state.handleAddGroup}>
          <Plus className="mr-2 h-4 w-4" />
          添加模型组
        </Button>
      </div>

      {state.groupsError || state.instancesError ? (
        <div role="alert" className="rounded-xl border p-8 text-center">
          无法加载模型资源。
          <Button
            variant="outline"
            className="ml-3"
            onClick={() => {
              void state.refetchGroups()
              void state.refetchInstances()
            }}
          >
            重试
          </Button>
        </div>
      ) : state.groupsLoading || state.instancesLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          </CardContent>
        </Card>
      ) : state.filteredGroups.length === 0 ? (
        state.searchQuery ? (
          <EmptyState searchQuery={state.searchQuery} />
        ) : state.ungroupedInstances.length > 0 ? null : (
          <EmptyState
            action={
              <Button onClick={state.handleAddGroup} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                添加第一个模型组
              </Button>
            }
          />
        )
      ) : (
        <GroupWorkspace state={state} />
      )}

      {!state.searchQuery &&
        !state.groupsLoading &&
        !state.instancesLoading &&
        !state.groupsError &&
        !state.instancesError && (
          <UngroupedInstancesSection
            instances={state.ungroupedInstances}
            groups={state.groups}
            getProviderName={state.getProviderName}
          />
        )}
      <ManagementDialogs state={state} />
    </div>
  )
}

function ManagementDialogs({ state }: { state: ReturnType<typeof useGroupManagement> }) {
  return (
    <>
      <InstancePickerDialog
        key={state.pickingGroupId ?? 'closed'}
        open={state.pickingGroupId !== null}
        onOpenChange={(open) => {
          if (!open) state.setPickingGroupId(null)
        }}
        group={state.pickingGroup}
        instances={state.instances}
        providers={state.providers}
        isPending={state.attachInstances.isPending}
        onConfirm={(instanceIds) => {
          if (state.pickingGroupId) {
            state.attachInstances.mutate(
              { groupId: state.pickingGroupId, instanceIds },
              {
                onSuccess: () => state.setPickingGroupId(null),
              },
            )
          }
        }}
      />

      <ModelGroupForm
        open={state.groupDialogOpen}
        onOpenChange={state.setGroupDialogOpen}
        form={state.groupForm as any}
        editingId={state.editingGroupId}
        isPending={state.groupSubmitPending}
        onSubmit={state.onGroupSubmit as any}
      />
      <ModelInstanceForm
        key={`${state.editingInstanceId ?? 'new'}-${state.instanceDialogOpen}`}
        open={state.instanceDialogOpen}
        onOpenChange={state.setInstanceDialogOpen}
        form={state.instanceForm as any}
        editingId={state.editingInstanceId}
        isPending={state.instanceSubmitPending}
        providers={state.providers}
        groups={state.groups}
        onSubmit={state.onInstanceSubmit as any}
      />
    </>
  )
}

function GroupWorkspace({ state }: { state: ReturnType<typeof useGroupManagement> }) {
  return (
    <div className="resource-workspace">
      <aside className="resource-master" aria-label="选择模型组">
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          模型组 · {state.filteredGroups.length}
        </p>
        <div className="resource-items">
          {state.filteredGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="resource-item"
              aria-pressed={state.selectedGroup?.id === group.id}
              onClick={() => state.setExpandedGroup(group.id)}
            >
              <span className="resource-icon">
                <Layers className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {group.displayName || group.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {state.instancesByGroup.get(group.id)?.length ?? 0} 个实例 · {group.name}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <div className="resource-detail">
        {state.selectedGroup && (
          <ModelGroupCard
            key={state.selectedGroup.id}
            group={state.selectedGroup}
            instances={state.instancesByGroup.get(state.selectedGroup.id) || []}
            onEdit={() => state.handleEditGroup(state.selectedGroup!)}
            onDelete={() =>
              state.handleDeleteGroup(state.selectedGroup!.id, state.selectedGroup!.name)
            }
            onAddInstance={() => state.setPickingGroupId(state.selectedGroup!.id)}
            onEditInstance={state.handleEditInstance}
            onDeleteInstance={state.handleDeleteInstance}
            onToggleInstance={state.handleToggleInstance}
            onReorderInstances={(orderedIds) =>
              state.handleReorderInstances(state.selectedGroup!.id, orderedIds)
            }
            onDetachInstance={(instance) =>
              state.detachInstance.mutate({
                groupId: state.selectedGroup!.id,
                instanceId: instance.id,
              })
            }
            getProviderName={state.getProviderName}
          />
        )}
      </div>
    </div>
  )
}
