import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Label } from '@/ui/label'
import { Switch } from '@/ui/switch'
import { Textarea } from '@/ui/textarea'

import type { InstanceFormData } from '../form-types'

type SchemaConfig = NonNullable<NonNullable<InstanceFormData['config']>['schemaConfig']>

interface SchemaTabProps {
  schemaConfig: SchemaConfig | undefined
  onChange: (updates: Partial<SchemaConfig>) => void
}

export function SchemaTab({ schemaConfig, onChange }: SchemaTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Schema 清理配置</CardTitle>
        <CardDescription>配置工具函数参数的 schema 清理规则</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm">启用清理</Label>
            <p className="text-xs text-muted-foreground">自动移除不兼容 OpenAI 的元数据字段</p>
          </div>
          <Switch
            checked={schemaConfig?.cleanEnabled ?? true}
            onCheckedChange={(checked) => onChange({ cleanEnabled: checked })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">保留字段（可选）</Label>
          <Textarea
            placeholder="输入要保留的字段，每行一个&#10;例如：$schema&#10;definitions"
            value={(schemaConfig?.preserveFields || []).join('\n')}
            onChange={(e) => onChange({
              preserveFields: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
            })}
            className="min-h-[80px] text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">额外清理字段（可选）</Label>
          <Textarea
            placeholder="输入要额外清理的字段，每行一个&#10;例如：customField&#10;deprecated"
            value={(schemaConfig?.additionalBannedFields || []).join('\n')}
            onChange={(e) => onChange({
              additionalBannedFields: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
            })}
            className="min-h-[80px] text-xs"
          />
        </div>
      </CardContent>
    </Card>
  )
}
