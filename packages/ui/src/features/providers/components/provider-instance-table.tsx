import { Pencil, Trash2 } from 'lucide-react'

import { StatusToggle } from '../../../shared/components/status-toggle'
import type { ModelInstance as BaseModelInstance } from '@xartifact/x-herald-shared'
import { Badge } from '../../../shared/components/ui/badge'
import { InstanceTestButton } from '../../model-groups/components/instance-test-button'

import { Button } from '../../../shared/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'

interface ModelInstance extends BaseModelInstance {
  groupIds?: string[]
}

interface ProviderInstanceTableProps {
  instances: ModelInstance[]
  getGroupName: (groupId: string | null) => string
  onEdit: (instance: ModelInstance) => void
  onDelete: (instance: ModelInstance) => void
  onToggle: (instance: ModelInstance) => void
}

export function ProviderInstanceTable({
  instances,
  getGroupName,
  onEdit,
  onDelete,
  onToggle,
}: ProviderInstanceTableProps) {
  if (instances.length === 0) {
    return <div className="text-center py-6 text-sm text-muted-foreground">暂无实例</div>
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {instances.map((instance, index) => (
          <article key={instance.id} className="rounded-md border p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h5 className="break-words text-sm font-medium">
                  <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                  {instance.name}
                </h5>
                <code className="block break-all text-xs text-muted-foreground">
                  {instance.actualModelName}
                </code>
              </div>
              <StatusToggle enabled={instance.enabled} onToggle={() => onToggle(instance)} />
            </div>
            <div className="mt-3 flex min-w-0 items-start gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">模型组</span>
              <div className="flex min-w-0 flex-wrap gap-1">
                {(instance.groupIds?.length ?? 0) > 0 ? (
                  (instance.groupIds ?? []).map((gid: string) => (
                    <Badge key={gid} variant="outline" className="max-w-full break-all text-xs">
                      {getGroupName(gid)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-1 [&>button]:h-9 [&>button]:w-9">
              <InstanceTestButton instanceId={instance.id} instanceName={instance.name} />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label={`编辑 ${instance.name}`}
                onClick={() => onEdit(instance)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label={`删除 ${instance.name}`}
                onClick={() => onDelete(instance)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </article>
        ))}
      </div>
      <div className="hidden md:block">
        <Table className="min-w-[760px]">
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
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{instance.name}</div>
                </TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    {instance.actualModelName}
                  </code>
                </TableCell>
                <TableCell>
                  {(instance.groupIds?.length ?? 0) > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {(instance.groupIds ?? []).map((gid: string) => (
                        <Badge key={gid} variant="outline" className="text-xs">
                          {getGroupName(gid)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusToggle enabled={instance.enabled} onToggle={() => onToggle(instance)} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <InstanceTestButton instanceId={instance.id} instanceName={instance.name} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`编辑 ${instance.name}`}
                      onClick={() => onEdit(instance)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`删除 ${instance.name}`}
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
      </div>
    </>
  )
}
