'use client'

import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/ui/button'
import { Badge } from '@/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/table'
import type { ModelInstance } from '../types'

interface ModelInstanceTableProps {
  instances: ModelInstance[]
  getProviderName: (providerId: string) => string
  onEdit: (instance: ModelInstance) => void
  onDelete: (instance: ModelInstance) => void
}

export function ModelInstanceTable({
  instances,
  getProviderName,
  onEdit,
  onDelete,
}: ModelInstanceTableProps) {
  if (instances.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        还没有模型实例
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>实例名称</TableHead>
          <TableHead>供应商</TableHead>
          <TableHead>实际模型</TableHead>
          <TableHead>权重/优先级</TableHead>
          <TableHead>状态</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {instances.map((instance) => (
          <TableRow key={instance.id}>
            <TableCell>
              <div className="font-medium">{instance.name}</div>
            </TableCell>
            <TableCell>{getProviderName(instance.providerId)}</TableCell>
            <TableCell>
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {instance.actualModelName}
              </code>
            </TableCell>
            <TableCell>
              {instance.weight} / {instance.priority}
            </TableCell>
            <TableCell>
              <Badge variant={instance.enabled ? 'default' : 'destructive'}>
                {instance.enabled ? '启用' : '禁用'}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => onEdit(instance)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(instance)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
