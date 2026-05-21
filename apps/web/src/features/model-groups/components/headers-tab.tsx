import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@x-llm-gateway/ui'
import { Input } from '@x-llm-gateway/ui'

interface HeadersTabProps {
  headers: Record<string, string>
  onAdd: () => void
  onUpdate: (oldKey: string, newKey: string, value: string) => void
  onRemove: (key: string) => void
}

export function HeadersTab({ headers, onAdd, onUpdate, onRemove }: HeadersTabProps) {
  const entries = Object.entries(headers)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">自定义 HTTP Headers</h4>
          <p className="text-xs text-muted-foreground">添加到 Provider 请求的自定义 Headers</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />添加 Header
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
          暂无自定义 Headers，点击上方按钮添加
        </div>
      )}

      {entries.map(([key, headerValue], index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            placeholder="Header 名称"
            value={key}
            onChange={(e) => onUpdate(key, e.target.value, headerValue)}
            className="flex-1 h-8 text-xs"
          />
          <Input
            placeholder="Header 值"
            value={headerValue}
            onChange={(e) => onUpdate(key, key, e.target.value)}
            className="flex-1 h-8 text-xs"
          />
          <Button
            type="button" variant="ghost" size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onRemove(key)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}

      <div className="text-xs text-muted-foreground">
        <p>变量支持：</p>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li><code>{'${requestId}'}</code> - 当前请求 ID</li>
        </ul>
      </div>
    </div>
  )
}
