'use client'

import { useState } from 'react'

import { Plus, Search } from 'lucide-react'

import { ModelInstanceForm } from '@/features/model-groups/components/model-instance-form'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { Input } from '@/ui/input'

import { ProviderFormDialog, SyncModelsDialog, ProviderCard } from './components'
import { ThinkingTypeMappingDialog } from './components/ThinkingTypeMappingDialog'
import { useProviderPage } from './useProviderPage'

export default function ProvidersPage() {
  const {
    loading,
    filteredProviders,
    dialogOpen,
    setDialogOpen,
    editingProviderId,
    searchQuery,
    setSearchQuery,
    showApiKey,
    showFormApiKey,
    setShowFormApiKey,
    isSubmitting,
    form,
    PROTOCOL_OPTIONS,
    onSubmit,
    handleEdit,
    handleDelete,
    handleToggle,
    handleAddNew,
    toggleShowApiKey,
    // 实例相关
    providers,
    groups,
    instancesByProvider,
    expandedProvider,
    setExpandedProvider,
    instanceDialogOpen,
    setInstanceDialogOpen,
    editingInstanceId,
    instanceForm,
    instanceSubmitPending,
    getGroupName,
    handleAddInstance,
    handleEditInstance,
    handleDeleteInstance,
    handleToggleInstance,
    onInstanceSubmit,
  } = useProviderPage()

  const [thinkingMappingOpen, setThinkingMappingOpen] = useState(false)
  const [syncModelsOpen, setSyncModelsOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<{ id: string; name: string } | null>(null)

  const handleConfigureThinkingMapping = (providerId: string, name: string) => {
    setSelectedProvider({ id: providerId, name })
    setThinkingMappingOpen(true)
  }

  const handleSyncModels = (providerId: string, name: string) => {
    setSelectedProvider({ id: providerId, name })
    setSyncModelsOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">供应商管理</h2>
          <p className="text-muted-foreground">管理所有 LLM 供应商配置</p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          添加供应商
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索供应商..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">加载中...</div>
          </CardContent>
        </Card>
      ) : filteredProviders.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                {searchQuery ? '没有找到匹配的供应商' : '还没有供应商'}
              </p>
              {!searchQuery && (
                <Button onClick={handleAddNew} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  添加第一个供应商
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredProviders.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              instances={instancesByProvider.get(provider.id) || []}
              isExpanded={expandedProvider === provider.id}
              showApiKey={!!showApiKey[provider.id]}
              onToggleExpand={() =>
                setExpandedProvider(expandedProvider === provider.id ? null : provider.id)
              }
              onToggleShowApiKey={() => toggleShowApiKey(provider.id)}
              onToggle={() => handleToggle(provider.id)}
              onEdit={() => handleEdit(provider.id)}
              onDelete={() => handleDelete(provider.id, provider.name)}
              onSyncModels={() => handleSyncModels(provider.id, provider.name)}
              onConfigureThinking={() => handleConfigureThinkingMapping(provider.id, provider.name)}
              onAddInstance={() => handleAddInstance(provider.id)}
              onEditInstance={handleEditInstance}
              onDeleteInstance={handleDeleteInstance}
              onToggleInstance={handleToggleInstance}
              getGroupName={getGroupName}
            />
          ))}
        </div>
      )}

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

      <ProviderFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        editingId={editingProviderId}
        isPending={isSubmitting}
        showApiKey={showFormApiKey}
        onToggleShowApiKey={() => setShowFormApiKey(!showFormApiKey)}
        onSubmit={onSubmit}
        protocolOptions={PROTOCOL_OPTIONS}
      />

      <SyncModelsDialog
        providerId={selectedProvider?.id || ''}
        providerName={selectedProvider?.name || ''}
        open={syncModelsOpen}
        onOpenChange={setSyncModelsOpen}
      />

      <ThinkingTypeMappingDialog
        providerId={selectedProvider?.id || ''}
        providerName={selectedProvider?.name || ''}
        open={thinkingMappingOpen}
        onOpenChange={setThinkingMappingOpen}
      />
    </div>
  )
}
