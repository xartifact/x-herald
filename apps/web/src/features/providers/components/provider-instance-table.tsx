'use client'

import { Pencil, Trash2 } from 'lucide-react'

import type { ModelInstance } from '@/features/model-groups/types'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/table'

interface ProviderInstanceTableProps {
  instances: ModelInstance[]
  getGroupName: (groupId: string | null) => string
  onEdit: (instance: ModelInstance) => void
  onDelete: (instance: ModelInstance) => void
}

export function ProviderInstanceTable({
  instances,
  getGroupName,
  onEdit,
  onDelete,
}: ProviderInstanceTableProps) {
  if (instances.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        暂无实例
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>实例名称</TableHead>
          <TableHead>实际模型</TableHead>
          <TableHead>所属模型组</TableHead>
          <TableHead>状态</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {instances.map((instance, index) => (
          <TableRow key={instance.id}>
            <TableCell className="text-muted-foreground">
              {index + 1}
            </TableCell>
            <TableCell>
              <div className="font-medium">{instance.name}</div>
            </TableCell>
            <TableCell>
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {instance.actualModelName}
              </code>
            </TableCell>
            <TableCell>
              {instance.groupId ? (
                <Badge variant="outline" className="text-xs">
                  {getGroupName(instance.groupId)}
                </Badge>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={instance.enabled ? 'default' : 'destructive'}>
                {instance.enabled ? '启用' : '禁用'}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(instance)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(instance)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
