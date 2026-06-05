'use client'

import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Pencil,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react'

import { StatusToggle } from '../../../shared/components/status-toggle'
import type { ModelInstance } from '@x-llm-gateway/engine'
import { Badge } from '../../../shared/components/ui/badge'
import { Button } from '../../../shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/components/ui/card'

import { ProviderCardBody } from './provider-card-body'
import type { Provider, ProtocolsConfig } from '@x-llm-gateway/engine'

interface ProviderCardProps {
  provider: Provider
  instances: ModelInstance[]
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
  return Object.keys(protocols).filter((key) => protocols[key as keyof ProtocolsConfig])
}

export function ProviderCard({
  provider, instances, isExpanded, showApiKey,
  onToggleExpand, onToggleShowApiKey, onToggle, onEdit, onDelete,
  onSyncModels, onConfigureThinking, onAddInstance,
  onEditInstance, onDeleteInstance, onToggleInstance, getGroupName,
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
                  <Badge key={protocol} variant="outline" className="text-xs">{protocol}</Badge>
                ))}
              </div>
              <StatusToggle enabled={provider.enabled} onToggle={onToggle} />
              <Badge variant="secondary" className="text-xs">{instances.length} 个实例</Badge>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" title="同步模型" onClick={onSyncModels}><RefreshCw className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" title="配置 Thinking 映射" onClick={onConfigureThinking}><BrainCircuit className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={onToggleExpand}>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <ProviderCardBody
            provider={provider}
            instances={instances}
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
        </CardContent>
      )}
    </Card>
  )
}
