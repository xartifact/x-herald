import { useMemo, useState } from 'react'

import { Layers, Search } from 'lucide-react'

import type { ModelGroup, ModelInstance, Provider } from '@xartifact/x-herald-shared'
import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import { Checkbox } from '../../../shared/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../shared/components/ui/dialog'
import { Input } from '../../../shared/components/ui/input'

interface InstancePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: ModelGroup | null
  /** 全部未删除实例（需带 groupIds 以识别已在目标组内的实例） */
  instances: Array<ModelInstance & { groupIds?: string[] }>
  providers: Provider[]
  isPending: boolean
  onConfirm: (instanceIds: string[]) => void
}

/**
 * 从现有实例中选择挂载到模型组。
 * 已在目标组内的实例不显示；支持按实例名/实际模型名/供应商搜索。
 */
export function InstancePickerDialog({
  open,
  onOpenChange,
  group,
  instances,
  providers,
  isPending,
  onConfirm,
}: InstancePickerDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p.name])), [providers])

  const candidates = useMemo(() => {
    if (!group) return []
    const q = search.trim().toLowerCase()
    return instances.filter((inst) => {
      if ((inst.groupIds ?? []).includes(group.id)) return false
      if (!q) return true
      return (
        inst.name.toLowerCase().includes(q) ||
        inst.actualModelName.toLowerCase().includes(q) ||
        (providerById.get(inst.providerId) ?? '').toLowerCase().includes(q)
      )
    })
  }, [group, instances, search, providerById])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelected(new Set())
      setSearch('')
    }
    onOpenChange(next)
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const confirm = () => {
    if (selected.size === 0 || !group) return
    onConfirm([...selected])
    setSelected(new Set())
    setSearch('')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            添加实例到「{group?.displayName || group?.name || ''}」
          </DialogTitle>
          <DialogDescription>从现有实例中选择；已在该组内的实例不再显示</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索实例 / 模型 / 供应商..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="-mr-3 h-[320px] overflow-y-auto pr-3">
          {candidates.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">无可用实例</div>
          ) : (
            <div className="space-y-1 py-1">
              {candidates.map((inst) => (
                <label
                  key={inst.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border p-2.5 text-sm hover:bg-accent/50"
                >
                  <Checkbox
                    checked={selected.has(inst.id)}
                    onCheckedChange={() => toggle(inst.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{inst.name}</div>
                    <code className="text-xs text-muted-foreground">{inst.actualModelName}</code>
                  </div>
                  {!inst.enabled && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      已禁用
                    </Badge>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {providerById.get(inst.providerId) ?? '未知供应商'}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button onClick={confirm} disabled={isPending || selected.size === 0}>
            {isPending ? '添加中...' : `添加 ${selected.size} 个实例`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
