'use client'

import { Trash2, Layers, Server } from 'lucide-react'
import { Button } from '@/ui/button'
import { Badge } from '@/ui/badge'
import { Switch } from '@/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/table'
import { useDeleteMapping, useUpdateMapping } from '../useVirtualModels'
import type { ModelMappingItem } from '../types'

interface MappingListProps {
  virtualModelId: string
  mappings: ModelMappingItem[]
}

export function MappingList({ virtualModelId, mappings }: MappingListProps) {
  const deleteMapping = useDeleteMapping()
  const updateMapping = useUpdateMapping()

  const handleToggle = async (mapping: ModelMappingItem) => {
    await updateMapping.mutateAsync({
      virtualModelId,
      mappingId: mapping.id,
      data: { enabled: !mapping.enabled },
    })
  }

  const handleDelete = async (mapping: ModelMappingItem) => {
    const targetName = mapping.target?.name || mapping.targetId
    if (!confirm(`确定要删除映射 "${targetName}" 吗？`)) return
    await deleteMapping.mutateAsync({ virtualModelId, mappingId: mapping.id })
  }

  if (mappings.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        暂无映射配置，点击上方按钮添加
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>类型</TableHead>
          <TableHead>目标</TableHead>
          <TableHead>权重</TableHead>
          <TableHead>优先级</TableHead>
          <TableHead>启用</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {mappings.map((m) => (
          <TableRow key={m.id}>
            <TableCell>
              <Badge variant={m.targetType === 'model_group' ? 'default' : 'secondary'}>
                {m.targetType === 'model_group' ? (
                  <><Layers className="mr-1 h-3 w-3" />模型组</>
                ) : (
                  <><Server className="mr-1 h-3 w-3" />实例</>
                )}
              </Badge>
            </TableCell>
            <TableCell>
              <div>
                <span className="font-medium">{m.target?.name || m.targetId}</span>
                {m.target?.providerName && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({m.target.providerName})
                  </span>
                )}
                {m.target?.actualModelName && (
                  <div className="text-xs text-muted-foreground">
                    → {m.target.actualModelName}
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell>{m.weight}</TableCell>
            <TableCell>{m.priority}</TableCell>
            <TableCell>
              <Switch
                checked={m.enabled}
                onCheckedChange={() => handleToggle(m)}
              />
            </TableCell>
            <TableCell className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(m)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
