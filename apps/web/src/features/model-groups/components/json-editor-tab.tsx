import { AlertCircle } from 'lucide-react'

import { Badge } from '@x-llm-gateway/ui'
import { Label } from '@x-llm-gateway/ui'
import { Textarea } from '@x-llm-gateway/ui'

interface JsonEditorTabProps {
  json: string
  onChange: (json: string) => void
  error: string | null
}

export function JsonEditorTab({ json, onChange, error }: JsonEditorTabProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">原始 JSON 配置</Label>
        {error && (
          <Badge variant="destructive" className="text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />格式错误
          </Badge>
        )}
      </div>
      <Textarea
        value={json}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[300px] font-mono text-xs"
      />
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
