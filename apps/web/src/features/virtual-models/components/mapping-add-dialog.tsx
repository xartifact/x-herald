'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/ui/dialog'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import { useModelGroups, useModelInstances } from '@/features/model-groups/useModelGroups'
import { useAddMapping } from '../useVirtualModels'

interface MappingAddDialogProps {
  virtualModelId: string
}

export function MappingAddDialog({ virtualModelId }: MappingAddDialogProps) {
  const [open, setOpen] = useState(false)
  const [targetType, setTargetType] = useState<'model_group' | 'model_instance'>('model_group')
  const [targetId, setTargetId] = useState('')
  const [weight, setWeight] = useState(100)
  const [priority, setPriority] = useState(0)

  const { data: groups = [] } = useModelGroups()
  const { data: instances = [] } = useModelInstances()
  const addMapping = useAddMapping()

  const handleSubmit = async () => {
    if (!targetId) return
    await addMapping.mutateAsync({
      virtualModelId,
      data: { targetType, targetId, weight, priority },
    })
    setOpen(false)
    resetForm()
  }

  const resetForm = () => {
    setTargetType('model_group')
    setTargetId('')
    setWeight(100)
    setPriority(0)
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        添加映射
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>添加映射目标</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>目标类型</Label>
              <Select
                value={targetType}
                onValueChange={(v) => { setTargetType(v as 'model_group' | 'model_instance'); setTargetId('') }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="model_group">模型组</SelectItem>
                  <SelectItem value="model_instance">模型实例</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>选择目标</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择目标..." />
                </SelectTrigger>
                <SelectContent>
                  {targetType === 'model_group'
                    ? groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.displayName} ({g.name})
                        </SelectItem>
                      ))
                    : instances.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name} → {inst.actualModelName}
                        </SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>权重</Label>
                <Input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>优先级</Label>
                <Input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  min={0}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!targetId || addMapping.isPending}
            >
              {addMapping.isPending ? '添加中...' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
