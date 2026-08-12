import { Pencil, Trash2, Lock, Waypoints } from 'lucide-react'

import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import { Card, CardContent } from '../../../shared/components/ui/card'
import { Switch } from '../../../shared/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/table'

import { CATCHALL_VM_NAME } from '@xartifact/x-herald-shared'
import type { AccessModel } from '@xartifact/x-herald-shared'

interface AccessModelTableProps {
  models: AccessModel[]
  onEdit: (am: AccessModel) => void
  onDelete: (am: AccessModel) => void
  onToggle: (id: string) => void
  onOpenRouteRules?: (am: AccessModel) => void
}

export function AccessModelTable({
  models,
  onEdit,
  onDelete,
  onToggle,
  onOpenRouteRules,
}: AccessModelTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>接入模型名</TableHead>
              <TableHead>描述</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((am) => (
              <TableRow key={am.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div>
                      <code className="font-medium">{am.name}</code>
                      {am.displayName && (
                        <div className="text-xs text-muted-foreground">{am.displayName}</div>
                      )}
                    </div>
                    {am.name === CATCHALL_VM_NAME && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Lock className="h-2.5 w-2.5" />
                        系统
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{am.description || '-'}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant={am.enabled ? 'default' : 'secondary'}>
                      {am.enabled ? '启用' : '禁用'}
                    </Badge>
                    <Switch checked={am.enabled} onCheckedChange={() => onToggle(am.id)} />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {onOpenRouteRules && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="路由规则"
                        onClick={() => onOpenRouteRules(am)}
                      >
                        <Waypoints className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" title="编辑" onClick={() => onEdit(am)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {am.name !== CATCHALL_VM_NAME && (
                      <Button variant="ghost" size="sm" title="删除" onClick={() => onDelete(am)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
