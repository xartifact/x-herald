import { Eye, EyeOff, Plus } from 'lucide-react'

import type { ModelInstance } from '@x-llm-gateway/engine'
import { Button } from '../ui/button'
import { Separator } from '../ui/separator'

import { ProviderInstanceTable } from './provider-instance-table'
// TODO(6): from apps/web
import type { Provider } from '@x-llm-gateway/engine'

interface InstanceHandlers {
  onAdd: () => void
  onEdit: (instance: ModelInstance) => void
  onDelete: (instance: ModelInstance) => void
  onToggle: (instance: ModelInstance) => void
  getGroupName: (groupId: string | null) => string
}

interface ProviderCardBodyProps {
  provider: Provider
  instances: ModelInstance[]
  showApiKey: boolean
  onToggleShowApiKey: () => void
  instanceHandlers: InstanceHandlers
}

export function ProviderCardBody({ provider, instances, showApiKey, onToggleShowApiKey, instanceHandlers }: ProviderCardBodyProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">API Key:</span>
          {provider.apiKey ? (
            <>
              <code className="text-xs text-muted-foreground">
                {showApiKey ? provider.apiKey : '•'.repeat(Math.min(provider.apiKey.length, 20))}
              </code>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onToggleShowApiKey}>
                {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">未设置</span>
          )}
        </div>
        <div>
          <span className="text-muted-foreground">创建时间:</span>
          <span className="ml-2">{new Date(provider.createdAt).toLocaleDateString('zh-CN')}</span>
        </div>
      </div>

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">模型实例</h4>
          <Button size="sm" variant="outline" onClick={instanceHandlers.onAdd}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            添加实例
          </Button>
        </div>
        <ProviderInstanceTable
          instances={instances}
          getGroupName={instanceHandlers.getGroupName}
          onEdit={instanceHandlers.onEdit}
          onDelete={instanceHandlers.onDelete}
          onToggle={instanceHandlers.onToggle}
        />
      </div>
    </div>
  )
}
