import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'

import {
  Card, CardContent, Button, Input,
  useProviders, useCreateProvider, useUpdateProvider, useDeleteProvider, useToggleProvider,
  useModelGroups, useModelInstances,
  ProviderCard, ProviderFormDialog,
} from '@x-llm-gateway/ui'
import type { Provider } from '@x-llm-gateway/shared'
import type { ProviderFormData } from '@x-llm-gateway/ui'
import { Plus, Search } from 'lucide-react'

const PROTOCOL_OPTIONS = [
  { value: 'openai', label: 'OpenAI', defaultUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', defaultUrl: 'https://api.anthropic.com' },
  { value: 'gemini', label: 'Gemini', defaultUrl: 'https://generativelanguage.googleapis.com/v1beta' },
] as const

const defaultValues: ProviderFormData = {
  name: '', apiKey: '', enabled: true,
  protocols: { openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' } },
}

function providerToForm(p: Provider): ProviderFormData {
  return { name: p.name, apiKey: '', enabled: p.enabled, protocols: { ...p.protocols } }
}

export function ProvidersPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [showApiKeyForm, setShowApiKeyForm] = useState(false)

  const form = useForm<ProviderFormData>({ defaultValues })

  const { data: providers = [], isLoading } = useProviders()
  const { data: groups = [] } = useModelGroups()
  const { data: allInstances = [] } = useModelInstances()
  const createMut = useCreateProvider()
  const updateMut = useUpdateProvider()
  const deleteMut = useDeleteProvider()
  const toggleMut = useToggleProvider()

  const filtered = searchQuery
    ? providers.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : providers

  const instancesByProvider = new Map<string, typeof allInstances>()
  for (const inst of allInstances as any[]) {
    const pid = inst.providerId
    if (!instancesByProvider.has(pid)) instancesByProvider.set(pid, [])
    instancesByProvider.get(pid)!.push(inst)
  }
  const getGroupName = (gid: string | null) => (groups as any[]).find(g => g.id === gid)?.name ?? gid ?? ''

  const handleAddNew = useCallback(() => { setEditId(null); form.reset(defaultValues); setShowApiKeyForm(false); setDialogOpen(true) }, [form])
  const handleEdit = useCallback((id: string) => {
    const p = providers.find(pr => pr.id === id)
    if (p) { setEditId(id); form.reset(providerToForm(p)); setShowApiKeyForm(false); setDialogOpen(true) }
  }, [providers, form])
  const handleSubmit = useCallback((data: ProviderFormData) => {
    const payload = { name: data.name, apiKey: data.apiKey || undefined, protocols: data.protocols, enabled: data.enabled }
    if (editId) updateMut.mutate({ id: editId, data: payload as Partial<Provider> }, { onSuccess: () => setDialogOpen(false) })
    else createMut.mutate(payload as any, { onSuccess: () => setDialogOpen(false) })
  }, [editId, createMut, updateMut])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">供应商管理</h2>
          <p className="text-muted-foreground">管理所有 LLM 供应商配置</p>
        </div>
        <Button onClick={handleAddNew}><Plus className="mr-2 h-4 w-4" />添加供应商</Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜索供应商..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8" />
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-12"><div className="text-center text-muted-foreground">加载中...</div></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12"><div className="text-center space-y-4">
          <p className="text-muted-foreground">{searchQuery ? '没有找到匹配的供应商' : '还没有供应商'}</p>
          {!searchQuery && <Button onClick={handleAddNew} variant="outline"><Plus className="mr-2 h-4 w-4" />添加第一个供应商</Button>}
        </div></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {filtered.map(provider => (
            <ProviderCard
              key={provider.id} provider={provider as any}
              instances={instancesByProvider.get(provider.id) || []}
              isExpanded={expandedProvider === provider.id}
              showApiKey={!!showApiKey[provider.id]}
              onToggleExpand={() => setExpandedProvider(expandedProvider === provider.id ? null : provider.id)}
              onToggleShowApiKey={() => setShowApiKey(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
              onToggle={() => toggleMut.mutate(provider.id)}
              onEdit={() => handleEdit(provider.id)}
              onDelete={() => deleteMut.mutate(provider.id)}
              onSyncModels={() => {}}
              onConfigureThinking={() => {}}
              onAddInstance={() => {}}
              onEditInstance={() => {}}
              onDeleteInstance={() => {}}
              onToggleInstance={() => {}}
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
    </div>
  )
}
