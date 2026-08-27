import { Pencil, Trash2, ArrowUp, ArrowDown, Unlink } from 'lucide-react'

import { StatusToggle } from '../../../shared/components/status-toggle'
import { InstanceAiChat } from '../../ai-assist'
import { Button } from '../../../shared/components/ui/button'
import { InstanceTestButton } from './instance-test-button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'

import type { ModelInstance } from '@xartifact/x-herald-shared'

interface ModelInstanceTableProps {
  instances: ModelInstance[]
  getProviderName: (providerId: string) => string
  /** 所属模型组 id；提供时在操作列显示"移出本组" */
  groupId?: string
  onEdit: (instance: ModelInstance) => void
  onDelete: (instance: ModelInstance) => void
  onMove: (instanceId: string, direction: 'up' | 'down') => void
  onToggle: (instance: ModelInstance) => void
  /** 仅解绑成员关系，不删除实例本身 */
  onDetach?: (groupId: string, instance: ModelInstance) => void
}

export function ModelInstanceTable({
  instances,
  getProviderName,
  groupId,
  onEdit,
  onDelete,
  onMove,
  onToggle,
  onDetach,
}: ModelInstanceTableProps) {
  if (instances.length === 0) {
    return <div className="text-center py-6 text-sm text-muted-foreground">暂无实例</div>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>实例名称</TableHead>
          <TableHead>供应商</TableHead>
          <TableHead>实际模型</TableHead>
          <TableHead>状态</TableHead>
          <TableHead className="w-24">排序</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {instances.map((instance, index) => (
          <TableRow key={instance.id}>
            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
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
              <StatusToggle enabled={instance.enabled} onToggle={() => onToggle(instance)} />
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onMove(instance.id, 'up')}
                  disabled={index === 0}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onMove(instance.id, 'down')}
                  disabled={index === instances.length - 1}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <InstanceAiChat instanceId={instance.id} instanceName={instance.name} />
                <InstanceTestButton instanceId={instance.id} instanceName={instance.name} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onEdit(instance)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {groupId && onDetach && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="移出本组（不删除实例）"
                    onClick={() => onDetach(groupId, instance)}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onDelete(instance)}
                >
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
