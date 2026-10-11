import { Plus, Search, Loader2 } from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Input,
  ProviderCard,
  ProviderFormDialog,
  ModelInstanceForm,
  SyncModelsDialog,
  ThinkingTypeMappingDialog,
  PROTOCOL_OPTIONS,
  PageHeader,
  EmptyState,
} from '@xartifact/x-herald-ui'
import { useProviderManagement } from '../../../components/use-provider-management'

export function ProvidersPage() {
  const state = useProviderManagement()
  return (
    <div className="space-y-6">
      <PageHeader
        title="供应商管理"
        description="连接上游服务，集中管理协议与模型资源"
        actions={
          <Button onClick={state.handleAddNew}>
            <Plus className="mr-2 h-4 w-4" />
            添加供应商
          </Button>
        }
      />

      <div className="resource-toolbar flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索供应商..."
            value={state.searchQuery}
            onChange={(e) => state.setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {state.error || state.instancesError ? (
        <div role="alert" className="rounded-xl border p-8 text-center">
          无法加载供应商或模型实例。
          <Button
            variant="outline"
            className="ml-3"
            onClick={() => {
              void state.refetch()
              void state.refetchInstances()
            }}
          >
            重试
          </Button>
        </div>
      ) : state.isLoading || state.instancesLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          </CardContent>
        </Card>
      ) : state.filtered.length === 0 ? (
        <EmptyState
          searchQuery={state.searchQuery}
          action={
            !state.searchQuery && (
              <Button onClick={state.handleAddNew} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                添加第一个供应商
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="provider-resource-row text-xs text-muted-foreground bg-muted/40">
            <span>供应商 / 协议</span>
            <span>模型实例</span>
            <span>状态</span>
            <span className="text-right">操作</span>
          </div>
          {state.filtered.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider as any}
              instances={state.instancesByProvider.get(provider.id) || []}
              instancesLoading={state.instancesLoading}
              instancesError={state.instancesError}
              refetchInstances={state.refetchInstances}
              isExpanded={state.expandedProvider === provider.id}
              showApiKey={!!state.showApiKey[provider.id]}
              onToggleShowApiKey={() =>
                state.setShowApiKey((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))
              }
              onToggleExpand={() =>
                state.setExpandedProvider(
                  state.expandedProvider === provider.id ? null : provider.id,
                )
              }
              onToggle={() => state.toggleMut.mutate(provider.id)}
              onEdit={() => {
                state.setExpandedProvider(null)
                state.handleEdit(provider.id)
              }}
              onDelete={() => state.handleDeleteProvider(provider.id)}
              onSyncModels={() => {
                state.setExpandedProvider(null)
                state.openSyncModels(provider.id, provider.name)
              }}
              onConfigureThinking={() => {
                state.setExpandedProvider(null)
                state.handleConfigureThinkingMapping(provider.id, provider.name)
              }}
              onAddInstance={() => {
                state.setExpandedProvider(null)
                state.handleAddInstance(provider.id)
              }}
              onEditInstance={(instance) => {
                state.setExpandedProvider(null)
                state.handleEditInstance(instance)
              }}
              onDeleteInstance={state.handleDeleteInstance}
              onToggleInstance={state.handleToggleInstance}
              getGroupName={state.getGroupName}
            />
          ))}
        </div>
      )}

      <ManagementDialogs state={state} />
    </div>
  )
}

function ManagementDialogs({ state }: { state: ReturnType<typeof useProviderManagement> }) {
  return (
    <>
      <ProviderFormDialog
        open={state.dialogOpen}
        onOpenChange={state.setDialogOpen}
        form={state.form}
        editingId={state.editId}
        isPending={state.createMut.isPending || state.updateMut.isPending}
        showApiKey={state.showApiKeyForm}
        onToggleShowApiKey={() => state.setShowApiKeyForm(!state.showApiKeyForm)}
        onSubmit={state.handleSubmit}
        protocolOptions={PROTOCOL_OPTIONS as any}
      />

      <ModelInstanceForm
        key={`${state.editingInstanceId ?? 'new'}-${state.instanceDialogOpen}`}
        open={state.instanceDialogOpen}
        onOpenChange={state.setInstanceDialogOpen}
        form={state.instanceForm as any}
        editingId={state.editingInstanceId}
        isPending={state.instanceSubmitPending}
        providers={state.providers as any}
        groups={state.groups}
        onSubmit={state.onInstanceSubmit as any}
      />

      {state.selectedProvider && (
        <>
          <SyncModelsDialog
            providerId={state.selectedProvider.id}
            providerName={state.selectedProvider.name}
            open={state.syncModelsOpen}
            onOpenChange={state.setSyncModelsOpen}
          />
          <ThinkingTypeMappingDialog
            providerId={state.selectedProvider.id}
            providerName={state.selectedProvider.name}
            open={state.thinkingMappingOpen}
            onOpenChange={state.setThinkingMappingOpen}
          />
        </>
      )}
    </>
  )
}
