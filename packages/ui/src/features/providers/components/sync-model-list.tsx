import { RefreshCw, Loader2 } from 'lucide-react'

import { Badge } from '../../../shared/components/ui/index'
import { Button } from '../../../shared/components/ui/index'
import { Checkbox } from '../../../shared/components/ui/index'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui/index'

interface ProviderModel {
  id: string
  name: string
  synced: boolean
}

interface SyncSelectionHandlers {
  selected: Set<string>
  onToggle: (id: string) => void
  onSelectAll: (checked: boolean) => void
}

interface SyncModelListProps {
  models: ProviderModel[]
  isLoading: boolean
  onRefetch: () => void
  selection: SyncSelectionHandlers
}

export function SyncModelList({ models, isLoading, onRefetch, selection }: SyncModelListProps) {
  const unsyncedModels = models.filter((m) => !m.synced)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-muted-foreground">正在获取模型列表...</span>
      </div>
    )
  }

  if (models.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>未获取到模型列表</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRefetch}>
          <RefreshCw className="h-4 w-4 mr-1" />
          重试
        </Button>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={
                unsyncedModels.length > 0 && selection.selected.size === unsyncedModels.length
              }
              onCheckedChange={selection.onSelectAll}
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
                checked={selection.selected.has(model.id)}
                onCheckedChange={() => selection.onToggle(model.id)}
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
  )
}
