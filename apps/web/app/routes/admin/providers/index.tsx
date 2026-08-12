import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import {
  useProviders,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
  useToggleProvider,
  useProviderInstanceState,
  useProviderDialogState,
} from '../../../hooks/providers'
import type { ProviderFormData } from '@xartifact/x-herald-ui'
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
  providerSchema,
  PageHeader,
  EmptyState,
} from '@xartifact/x-herald-ui'
import type { Provider } from '@xartifact/x-herald-shared'
import { Plus, Search, Loader2 } from 'lucide-react'

const defaultValues: ProviderFormData = {
  name: '',
  apiKey: '',
  enabled: true,
  protocols: {
    openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' },
    anthropic: { enabled: false, baseUrl: '' },
    gemini: { enabled: false, baseUrl: '' },
  },
}

function providerToForm(p: Provider): ProviderFormData {
  return {
    name: p.name,
    apiKey: '',
    enabled: p.enabled,
    protocols: {
      openai: {
        enabled: !!p.protocols.openai?.enabled,
        baseUrl: p.protocols.openai?.baseUrl ?? '',
        toolSchemaSanitization: p.protocols.openai?.toolSchemaSanitization ?? false,
      },
      anthropic: {
        enabled: !!p.protocols.anthropic?.enabled,
        baseUrl: p.protocols.anthropic?.baseUrl ?? '',
        toolSchemaSanitization: p.protocols.anthropic?.toolSchemaSanitization ?? false,
      },
      gemini: {
        enabled: !!p.protocols.gemini?.enabled,
        baseUrl: p.protocols.gemini?.baseUrl ?? '',
        toolSchemaSanitization: p.protocols.gemini?.toolSchemaSanitization ?? false,
      },
    },
  }
}

export function ProvidersPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [showApiKeyForm, setShowApiKeyForm] = useState(false)

  const form = useForm<ProviderFormData>({
    defaultValues,
    resolver: zodResolver(providerSchema),
  })

  const { data: providers = [], isLoading } = useProviders()
  const createMut = useCreateProvider()
  const updateMut = useUpdateProvider()
  const deleteMut = useDeleteProvider()
  const toggleMut = useToggleProvider()

  const {
    instanceDialogOpen,
    setInstanceDialogOpen,
    editingInstanceId,
    instanceForm,
    instanceSubmitPending,
    instancesByProvider,
    getGroupName,
    handleAddInstance,
    handleEditInstance,
    handleDeleteInstance,
    handleToggleInstance,
    onInstanceSubmit,
  } = useProviderInstanceState()

  const {
    thinkingMappingOpen,
    setThinkingMappingOpen,
    syncModelsOpen,
    setSyncModelsOpen,
    selectedProvider,
    handleConfigureThinkingMapping,
    handleSyncModels: openSyncModels,
  } = useProviderDialogState()

  const filtered = searchQuery
    ? providers.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : providers

  const handleAddNew = useCallback(() => {
    setEditId(null)
    form.reset(defaultValues)
    setShowApiKeyForm(false)
    setDialogOpen(true)
  }, [form])
  const handleEdit = useCallback(
    (id: string) => {
      const p = providers.find((pr) => pr.id === id)
      if (p) {
        setEditId(id)
        form.reset(providerToForm(p))
        setShowApiKeyForm(false)
        setDialogOpen(true)
      }
    },
    [providers, form],
  )
  const handleSubmit = useCallback(
    (data: ProviderFormData) => {
      const protocols: Record<
        string,
        { enabled: boolean; baseUrl: string; toolSchemaSanitization?: boolean }
      > = {}
      for (const [key, val] of Object.entries(data.protocols)) {
        if (val?.enabled && val.baseUrl) {
          protocols[key] = {
            enabled: true,
            baseUrl: val.baseUrl,
            ...(val.toolSchemaSanitization && { toolSchemaSanitization: true }),
          }
        }
      }
      const payload = {
        name: data.name,
        apiKey: data.apiKey || undefined,
        protocols,
        enabled: data.enabled,
      }
      if (editId)
        updateMut.mutate(
          { id: editId, data: payload as Partial<Provider> },
          { onSuccess: () => setDialogOpen(false) },
        )
      else createMut.mutate(payload as any, { onSuccess: () => setDialogOpen(false) })
    },
    [editId, createMut, updateMut],
  )

  const handleDeleteProvider = useCallback(
    (id: string) => {
      const provider = providers.find((p) => p.id === id)
      if (!provider) return
      if (!confirm(`确定要删除供应商 "${provider.name}" 吗？\n\n此操作不可撤销。`)) return
      deleteMut.mutate(id)
    },
    [providers, deleteMut],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="供应商管理"
        description="管理所有 LLM 供应商配置"
        actions={
          <Button onClick={handleAddNew}>
            <Plus className="mr-2 h-4 w-4" />
            添加供应商
          </Button>
        }
      />

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

      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          searchQuery={searchQuery}
          action={
            !searchQuery && (
              <Button onClick={handleAddNew} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                添加第一个供应商
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider as any}
              instances={instancesByProvider.get(provider.id) || []}
              isExpanded={expandedProvider === provider.id}
              showApiKey={!!showApiKey[provider.id]}
              onToggleExpand={() =>
                setExpandedProvider(expandedProvider === provider.id ? null : provider.id)
              }
              onToggleShowApiKey={() =>
                setShowApiKey((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))
              }
              onToggle={() => toggleMut.mutate(provider.id)}
              onEdit={() => handleEdit(provider.id)}
              onDelete={() => handleDeleteProvider(provider.id)}
              onSyncModels={() => openSyncModels(provider.id, provider.name)}
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

      <ProviderFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        editingId={editId}
        isPending={createMut.isPending || updateMut.isPending}
        showApiKey={showApiKeyForm}
        onToggleShowApiKey={() => setShowApiKeyForm(!showApiKeyForm)}
        onSubmit={handleSubmit}
        protocolOptions={PROTOCOL_OPTIONS as any}
      />

      <ModelInstanceForm
        open={instanceDialogOpen}
        onOpenChange={setInstanceDialogOpen}
        form={instanceForm as any}
        editingId={editingInstanceId}
        isPending={instanceSubmitPending}
        providers={providers as any}
        onSubmit={onInstanceSubmit as any}
      />

      {selectedProvider && (
        <>
          <SyncModelsDialog
            providerId={selectedProvider.id}
            providerName={selectedProvider.name}
            open={syncModelsOpen}
            onOpenChange={setSyncModelsOpen}
          />
          <ThinkingTypeMappingDialog
            providerId={selectedProvider.id}
            providerName={selectedProvider.name}
            open={thinkingMappingOpen}
            onOpenChange={setThinkingMappingOpen}
          />
        </>
      )}
    </div>
  )
}
