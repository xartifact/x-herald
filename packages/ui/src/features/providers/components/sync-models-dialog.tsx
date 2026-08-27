import { useState, useEffect, useMemo } from 'react'

import { Loader2, Search } from 'lucide-react'

import { useModelGroups } from '../../model-groups'
import { Button, Input } from '../../../shared/components/ui/index'
import { Checkbox } from '../../../shared/components/ui/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../shared/components/ui/index'

import { useProviderModels, useSyncProviderModels } from '../hooks/use-providers'
import { SyncModelList } from './sync-model-list'

interface SyncModelsDialogProps {
  providerId: string
  providerName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SyncModelsDialog({
  providerId,
  providerName,
  open,
  onOpenChange,
}: SyncModelsDialogProps) {
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  const { data: models = [], isLoading, refetch } = useProviderModels(providerId, open)
  const { data: groups = [] } = useModelGroups()
  const syncModels = useSyncProviderModels()

  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return models
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.id ?? '').toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q),
    )
  }, [models, searchQuery])

  useEffect(() => {
    if (open) {
      setSelectedModels(new Set())
      setSelectedGroups(new Set())
      setSearchQuery('')
    }
  }, [open])

  const handleToggle = (modelId: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev)
      if (next.has(modelId)) next.delete(modelId)
      else next.add(modelId)
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    setSelectedModels(
      checked ? new Set(filteredModels.filter((m) => !m.synced).map((m) => m.id)) : new Set(),
    )
  }

  const toggleGroup = (groupId: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const handleSync = async () => {
    const toSync = filteredModels.filter((m) => selectedModels.has(m.id))
    await syncModels.mutateAsync({
      providerId,
      models: toSync.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        cost: m.cost,
        capabilities: m.capabilities,
      })),
      groupIds: [...selectedGroups],
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>同步模型 - {providerName}</DialogTitle>
          <DialogDescription>从供应商 API 获取可用模型并同步为模型实例</DialogDescription>
        </DialogHeader>

        <div className="relative mb-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索模型名称 / ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <SyncModelList
            models={filteredModels}
            isLoading={isLoading}
            onRefetch={refetch}
            selection={{
              selected: selectedModels,
              onToggle: handleToggle,
              onSelectAll: handleSelectAll,
            }}
          />
        </div>

        <div className="space-y-3 pt-3 border-t">
          {groups.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  绑定模型组：
                </span>
                <span className="text-xs text-muted-foreground">（可多选）</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {groups.map((group) => (
                  <label
                    key={group.id}
                    className="flex items-center gap-1.5 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectedGroups.has(group.id)}
                      onCheckedChange={() => toggleGroup(group.id)}
                    />
                    <span className="whitespace-nowrap">{group.displayName || group.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              onClick={handleSync}
              disabled={selectedModels.size === 0 || syncModels.isPending}
            >
              {syncModels.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  同步中...
                </>
              ) : (
                `同步 ${selectedModels.size} 个模型`
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
