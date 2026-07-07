'use client'

import { useState, useEffect } from 'react'

import { Loader2 } from 'lucide-react'

import { useModelGroups } from '../../model-groups'
import { Button } from '../../../shared/components/ui/index'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../shared/components/ui/index'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  const [groupId, setGroupId] = useState<string>('')

  const { data: models = [], isLoading, refetch } = useProviderModels(providerId, open)
  const { data: groups = [] } = useModelGroups()
  const syncModels = useSyncProviderModels()

  useEffect(() => {
    if (open) {
      setSelectedModels(new Set())
      setGroupId('')
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
      checked ? new Set(models.filter((m) => !m.synced).map((m) => m.id)) : new Set(),
    )
  }

  const handleSync = async () => {
    const toSync = models.filter((m) => selectedModels.has(m.id))
    await syncModels.mutateAsync({
      providerId,
      models: toSync.map((m) => ({ id: m.id, name: m.name })),
      groupId: groupId || undefined,
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

        <div className="flex-1 overflow-y-auto min-h-0">
          <SyncModelList
            models={models}
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
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground whitespace-nowrap">绑定模型组：</span>
            <Select
              value={groupId || '__none__'}
              onValueChange={(v) => setGroupId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="不绑定" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">不绑定</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.displayName || group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
