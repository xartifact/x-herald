import { ArrowRightCircle, Trash2 } from 'lucide-react'

import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import { Switch } from '../../../shared/components/ui/switch'
import { TableCell, TableRow } from '../../../shared/components/ui/table'

import type { AccessModel, PotentialModel } from '@xartifact/x-herald-shared'

interface PotentialModelRowProps {
  pm: PotentialModel
  accessModelsById: Map<string, AccessModel>
  actionLabel: string
  onConvert: (pm: PotentialModel) => void
  onRouteTo: (pm: PotentialModel) => void
  onToggleEnabled: (pm: PotentialModel) => void
  onDelete: (pm: PotentialModel) => void
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

export function PotentialModelRow({
  pm,
  accessModelsById,
  actionLabel,
  onConvert,
  onRouteTo,
  onToggleEnabled,
  onDelete,
}: PotentialModelRowProps) {
  const handleDelete = () => {
    if (!window.confirm(`确定要删除潜在模型 "${pm.modelName}" 吗？\n\n此操作不可撤销。`)) return
    onDelete(pm)
  }

  const targetAccessModel = pm.targetAccessModelId
    ? accessModelsById.get(pm.targetAccessModelId)
    : null
  const actionBadgeVariant = pm.action === 'observe' ? 'secondary' : 'default'

  return (
    <TableRow>
      <TableCell>
        <code className="font-medium">{pm.modelName}</code>
      </TableCell>
      <TableCell className="text-right font-mono">{pm.requestCount.toLocaleString()}</TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">{formatRelativeTime(pm.lastSeenAt)}</span>
      </TableCell>
      <TableCell>
        <Badge variant={actionBadgeVariant}>{actionLabel}</Badge>
        {!pm.enabled && (
          <Badge variant="outline" className="ml-1 border-dashed">
            禁用
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {pm.action === 'route_to_access_model' && targetAccessModel ? (
          <div className="flex items-center gap-1">
            <ArrowRightCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <div className="font-medium text-sm">
                {targetAccessModel.displayName || targetAccessModel.name}
              </div>
              {targetAccessModel.displayName && (
                <code className="text-xs text-muted-foreground">{targetAccessModel.name}</code>
              )}
            </div>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge
            variant={pm.enabled ? 'default' : 'outline'}
            className={!pm.enabled ? 'border-dashed' : ''}
          >
            {pm.enabled ? '启用' : '禁用'}
          </Badge>
          <Switch
            checked={pm.enabled}
            onCheckedChange={() => onToggleEnabled(pm)}
            aria-label={pm.enabled ? '禁用' : '启用'}
          />
        </div>
      </TableCell>
      <TableCell className="text-right font-mono">{pm.sampleVirtualKeyIds?.length ?? 0}</TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground" title={pm.note ?? ''}>
          {pm.note || '—'}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onConvert(pm)}>
            转换
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onRouteTo(pm)}>
            路由至
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} aria-label="删除">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
