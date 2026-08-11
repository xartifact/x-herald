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

import type { ProviderModelInfo } from '@xartifact/x-llm-gateway-shared'

interface SyncSelectionHandlers {
  selected: Set<string>
  onToggle: (id: string) => void
  onSelectAll: (checked: boolean) => void
}

interface SyncModelListProps {
  models: ProviderModelInfo[]
  isLoading: boolean
  onRefetch: () => void
  selection: SyncSelectionHandlers
}

/** 格式化计费信息为简洁展示 */
function formatCost(cost?: { input: number; output: number }): string | null {
  if (!cost) return null
  const fmt = (v: number) => `$${v}`
  return `${fmt(cost.input)} / ${fmt(cost.output)}`
}

/** 渲染能力标签 */
function CapabilityBadges({ caps }: { caps?: ProviderModelInfo['capabilities'] }) {
  if (!caps) return null
  const items: Array<{ label: string; value: boolean | undefined }> = [
    { label: 'Vision', value: caps.vision },
    { label: 'Reasoning', value: caps.reasoning },
    { label: 'Tools', value: caps.functionCalling },
    { label: 'JSON', value: caps.jsonMode },
    { label: 'Stream', value: caps.streaming },
  ]
  const active = items.filter((i) => i.value)
  if (active.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {active.map((i) => (
        <Badge key={i.label} variant="outline" className="text-[10px] px-1 py-0">
          {i.label}
        </Badge>
      ))}
    </div>
  )
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
          <TableHead className="w-32">上下文窗口</TableHead>
          <TableHead className="w-32">计费 (输入/输出)</TableHead>
          <TableHead className="w-40">能力</TableHead>
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
              {model.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {model.description}
                </p>
              )}
            </TableCell>
            <TableCell>
              {model.contextWindow ? (
                <span className="text-xs text-muted-foreground">
                  {(model.contextWindow / 1000).toFixed(0)}K
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              {formatCost(model.cost) ? (
                <span className="text-xs font-mono text-muted-foreground">
                  {formatCost(model.cost)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <CapabilityBadges caps={model.capabilities} />
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
