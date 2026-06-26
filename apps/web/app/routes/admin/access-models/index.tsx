import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { Plus, Search } from 'lucide-react'

import { useAccessModels, useCreateAccessModel, useUpdateAccessModel, useDeleteAccessModel, useToggleAccessModel } from '../../../hooks/access-models'
import {
  Button,
  Card,
  CardContent,
  Input,
  AccessModelTable,
  AccessModelFormDialog,
} from '@x-llm-gateway/ui'

import type { AccessModel } from '@x-llm-gateway/shared'

const DEFAULT_CAPABILITIES = {
  streaming: true, functionCalling: false, vision: false, jsonMode: false,
  reasoning: false, contextWindow: 0, maxTokens: 0,
}

const defaultValues = {
  name: '', displayName: '', description: '', enabled: true,
  capabilities: DEFAULT_CAPABILITIES,
}

export function AccessModelsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const form = useForm({ defaultValues })

  const { data: accessModels = [], isLoading } = useAccessModels()
  const createAM = useCreateAccessModel()
  const updateAM = useUpdateAccessModel()
  const deleteAM = useDeleteAccessModel()
  const toggleAM = useToggleAccessModel()

  const handleAdd = useCallback(() => {
    setEditingId(null)
    form.reset(defaultValues)
    setDialogOpen(true)
  }, [form])

  const handleEdit = useCallback((am: AccessModel) => {
    setEditingId(am.id)
    const cap = am.capabilities
    form.reset({
      name: am.name, displayName: am.displayName || '', description: am.description || '',
      enabled: am.enabled,
      capabilities: cap ? {
        streaming: cap.streaming ?? true, functionCalling: cap.functionCalling ?? false,
        vision: cap.vision ?? false, jsonMode: cap.jsonMode ?? false,
        reasoning: Boolean(cap.reasoning), contextWindow: Number(cap.contextWindow ?? 0),
        maxTokens: Number(cap.maxTokens ?? 0),
      } : DEFAULT_CAPABILITIES,
    })
    setDialogOpen(true)
  }, [form])

  const handleDelete = useCallback((am: AccessModel) => {
    deleteAM.mutate(am.id)
  }, [deleteAM])

  const handleToggle = useCallback((id: string) => {
    toggleAM.mutate(id)
  }, [toggleAM])

  const onSubmit = useCallback((data: any) => {
    const payload = {
      name: data.name, displayName: data.displayName || undefined,
      description: data.description || undefined, enabled: data.enabled, capabilities: data.capabilities,
    }
    if (editingId) updateAM.mutate({ id: editingId, data: payload }, { onSuccess: () => setDialogOpen(false) })
    else createAM.mutate(payload as any, { onSuccess: () => setDialogOpen(false) })
  }, [editingId, createAM, updateAM])

  const filteredModels = accessModels.filter(
    (am) =>
      am.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (am.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">接入模型</h2>
          <p className="text-muted-foreground">管理对外暴露的接入模型名称，通过规则引擎路由到具体模型组或实例</p>
        </div>
        <Button onClick={handleAdd}><Plus className="mr-2 h-4 w-4" />创建接入模型</Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜索接入模型..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" />
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-12"><div className="text-center text-muted-foreground">加载中...</div></CardContent></Card>
      ) : filteredModels.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">{searchQuery ? '没有找到匹配的接入模型' : '还没有接入模型'}</p>
              {!searchQuery && <Button onClick={handleAdd} variant="outline"><Plus className="mr-2 h-4 w-4" />创建第一个接入模型</Button>}
            </div>
          </CardContent>
        </Card>
      ) : (
        <AccessModelTable models={filteredModels} onEdit={handleEdit} onDelete={handleDelete} onToggle={handleToggle} />
      )}

      <AccessModelFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form as any}
        editingId={editingId}
        isPending={createAM.isPending || updateAM.isPending}
        onSubmit={onSubmit as any}
      />
    </div>
  )
}
