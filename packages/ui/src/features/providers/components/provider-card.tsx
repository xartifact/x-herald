import { BrainCircuit, ChevronRight, Pencil, RefreshCw, Server, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../../../shared/components/ui/sheet'
import { StatusToggle } from '../../../shared/components/status-toggle'
import type { ModelInstance } from '@xartifact/x-herald-shared'
import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'

import { ProviderCardBody } from './provider-card-body'
import type { Provider, ProtocolsConfig } from '@xartifact/x-herald-shared'

interface ProviderCardProps {
  provider: Provider
  instances: ModelInstance[]
  instancesLoading: boolean
  instancesError: unknown
  refetchInstances: () => void
  isExpanded: boolean
  showApiKey: boolean
  onToggleExpand: () => void
  onToggleShowApiKey: () => void
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onSyncModels: () => void
  onConfigureThinking: () => void
  onAddInstance: () => void
  onEditInstance: (instance: ModelInstance) => void
  onDeleteInstance: (instance: ModelInstance) => void
  onToggleInstance: (instance: ModelInstance) => void
  getGroupName: (groupId: string | null) => string
}

function getEnabledProtocols(protocols: ProtocolsConfig): string[] {
  return Object.keys(protocols).filter((key) => protocols[key as keyof ProtocolsConfig]?.enabled)
}

export function ProviderCard({
  provider,
  instances,
  instancesLoading,
  instancesError,
  refetchInstances,
  isExpanded,
  showApiKey,
  onToggleExpand,
  onToggleShowApiKey,
  onToggle,
  onEdit,
  onDelete,
  onSyncModels,
  onConfigureThinking,
  onAddInstance,
  onEditInstance,
  onDeleteInstance,
  onToggleInstance,
  getGroupName,
}: ProviderCardProps) {
  const enabledProtocols = getEnabledProtocols(provider.protocols)

  return (
    <>
      <div className="provider-resource-row">
        <button
          type="button"
          className="flex min-w-0 items-center gap-3 text-left"
          onClick={onToggleExpand}
          aria-label={`查看 ${provider.name}`}
        >
          <span className="resource-icon">
            <Server className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{provider.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {enabledProtocols.join(' · ') || '未配置协议'}
            </span>
          </span>
        </button>
        <span className="text-sm text-muted-foreground">
          {instancesLoading || instancesError ? '—' : `${instances.length} 个实例`}
        </span>
        <StatusToggle enabled={provider.enabled} onToggle={onToggle} />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSyncModels}
            aria-label={`同步 ${provider.name} 的模型`}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
            aria-label={`打开 ${provider.name} 详情`}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Sheet
        open={isExpanded}
        onOpenChange={(open) => {
          if (!open) onToggleExpand()
        }}
      >
        <SheetContent className="management-sheet">
          <SheetHeader className="management-sheet-header">
            <SheetTitle>{provider.name}</SheetTitle>
            <SheetDescription>供应商连接、协议与模型实例</SheetDescription>
          </SheetHeader>
          <div className="management-sheet-body space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              {enabledProtocols.map((protocol) => (
                <Badge key={protocol} variant="outline">
                  {protocol}
                </Badge>
              ))}
              <StatusToggle enabled={provider.enabled} onToggle={onToggle} />
            </div>
            <dl className="space-y-3 rounded-lg border p-4">
              {enabledProtocols.map((protocol) => (
                <div key={protocol}>
                  <dt className="text-xs uppercase text-muted-foreground">{protocol}</dt>
                  <dd className="mt-1 break-all font-mono text-xs">
                    {provider.protocols[protocol as keyof ProtocolsConfig]?.baseUrl}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                编辑连接
              </Button>
              <Button variant="outline" size="sm" onClick={onSyncModels}>
                <RefreshCw className="mr-2 h-4 w-4" />
                同步模型
              </Button>
              <Button variant="outline" size="sm" onClick={onConfigureThinking}>
                <BrainCircuit className="mr-2 h-4 w-4" />
                Thinking 映射
              </Button>
            </div>
            <ProviderCardBody
              provider={provider}
              instances={instances}
              instancesLoading={instancesLoading}
              instancesError={instancesError}
              refetchInstances={refetchInstances}
              showApiKey={showApiKey}
              onToggleShowApiKey={onToggleShowApiKey}
              instanceHandlers={{
                onAdd: onAddInstance,
                onEdit: onEditInstance,
                onDelete: onDeleteInstance,
                onToggle: onToggleInstance,
                getGroupName,
              }}
            />
          </div>
          <div className="management-sheet-footer">
            <Button variant="ghost" className="text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              删除供应商
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
