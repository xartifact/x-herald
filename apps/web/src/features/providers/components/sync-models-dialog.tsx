'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import { Checkbox } from '@/ui/checkbox'
import { Badge } from '@/ui/badge'
import { useProviderModels, useSyncProviderModels } from '../useProviders'
import { useModelGroups } from '@/features/model-groups/useModelGroups'

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

  // 打开时重置选中
  useEffect(() => {
    if (open) {
      setSelectedModels(new Set())
      setGroupId('')
    }
  }, [open])

  const unsyncedModels = models.filter((m) => !m.synced)

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedModels(new Set(unsyncedModels.map((m) => m.id)))
    } else {
      setSelectedModels(new Set())
    }
  }

  const handleToggle = (modelId: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev)
      if (next.has(modelId)) {
        next.delete(modelId)
      } else {
        next.add(modelId)
      }
      return next
    })
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
          <DialogDescription>
            从供应商 API 获取可用模型并同步为模型实例
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span className="text-muted-foreground">正在获取模型列表...</span>
            </div>
          ) : models.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>未获取到模型列表</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                重试
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={unsyncedModels.length > 0 && selectedModels.size === unsyncedModels.length}
                      onCheckedChange={handleSelectAll}
                      disabled={unsyncedModels.length === 0}
                    />
                  </TableHead>
                  <TableHead>模型名称</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedModels.has(model.id)}
                        onCheckedChange={() => handleToggle(model.id)}
                        disabled={model.synced}
                      />
                    </TableCell>
                    <TableCell>
                      <code className="text-sm">{model.id}</code>
                      {model.name !== model.id && (
                        <span className="ml-2 text-xs text-muted-foreground">{model.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {model.synced ? (
                        <Badge variant="secondary">已同步</Badge>
                      ) : (
                        <Badge variant="outline">未同步</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground whitespace-nowrap">绑定模型组：</span>
            <Select value={groupId || '__none__'} onValueChange={(v) => setGroupId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="不绑定" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">不绑定</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.displayName}
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
