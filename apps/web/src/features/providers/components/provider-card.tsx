'use client'

import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  BrainCircuit,
  RefreshCw,
  Server,
} from 'lucide-react'
import { Button } from '@/ui/button'
import { Badge } from '@/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { Separator } from '@/ui/separator'
import { ProviderInstanceTable } from './provider-instance-table'
import type { Provider, ProtocolsConfig } from '../types'
import type { ModelInstance } from '@/features/model-groups/types'

interface ProviderCardProps {
  provider: Provider
  instances: ModelInstance[]
  isExpanded: boolean
  showApiKey: boolean
  onToggleExpand: () => void
  onToggleShowApiKey: () => void
  onEdit: () => void
  onDelete: () => void
  onSyncModels: () => void
  onConfigureThinking: () => void
  onAddInstance: () => void
  onEditInstance: (instance: ModelInstance) => void
  onDeleteInstance: (instance: ModelInstance) => void
  getGroupName: (groupId: string | null) => string
}

function getEnabledProtocols(protocols: ProtocolsConfig): string[] {
  return Object.keys(protocols).filter((key) => protocols[key as keyof ProtocolsConfig])
}

export function ProviderCard({
  provider,
  instances,
  isExpanded,
  showApiKey,
  onToggleExpand,
  onToggleShowApiKey,
  onEdit,
  onDelete,
  onSyncModels,
  onConfigureThinking,
  onAddInstance,
  onEditInstance,
  onDeleteInstance,
  getGroupName,
}: ProviderCardProps) {
  const enabledProtocols = getEnabledProtocols(provider.protocols)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-primary" />
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{provider.name}</CardTitle>
              <div className="flex gap-1">
                {enabledProtocols.map((protocol) => (
                  <Badge key={protocol} variant="outline" className="text-xs">
                    {protocol}
                  </Badge>
                ))}
              </div>
              <Badge variant={provider.enabled ? 'default' : 'destructive'}>
                {provider.enabled ? '启用' : '禁用'}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {instances.length} 个实例
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" title="同步模型" onClick={onSyncModels}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" title="配置 Thinking 映射" onClick={onConfigureThinking}>
              <BrainCircuit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggleExpand}>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">API Key:</span>
                {provider.apiKey ? (
                  <>
                    <code className="text-xs text-muted-foreground">
                      {showApiKey
                        ? provider.apiKey
                        : '•'.repeat(Math.min(provider.apiKey.length, 20))}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={onToggleShowApiKey}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">未设置</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">创建时间:</span>
                <span className="ml-2">
                  {new Date(provider.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">模型实例</h4>
                <Button size="sm" variant="outline" onClick={onAddInstance}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  添加实例
                </Button>
              </div>
              <ProviderInstanceTable
                instances={instances}
                getGroupName={getGroupName}
                onEdit={onEditInstance}
                onDelete={onDeleteInstance}
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
