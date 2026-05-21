import { Trash2 } from 'lucide-react'

import { Button } from '@x-llm-gateway/ui'
import { Card, CardContent, CardHeader, CardTitle } from '@x-llm-gateway/ui'
import { Input } from '@x-llm-gateway/ui'
import { Label } from '@x-llm-gateway/ui'

import type { InstanceFormData } from '../form-types'

type TransformRule = NonNullable<NonNullable<InstanceFormData['config']>['parameterTransforms']>[0]

interface TransformRuleCardProps {
  transform: TransformRule
  index: number
  onUpdate: (index: number, transform: TransformRule) => void
  onRemove: (index: number) => void
}

export function TransformRuleCard({ transform, index, onUpdate, onRemove }: TransformRuleCardProps) {
  return (
    <Card className="relative">
      <Button
        type="button" variant="ghost" size="sm"
        className="absolute top-2 right-2 h-8 w-8 p-0"
        onClick={() => onRemove(index)}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">规则 {index + 1}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">匹配条件 (When)</Label>
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="参数名"
              value={transform.when?.paramName || ''}
              onChange={(e) => onUpdate(index, {
                ...transform,
                when: { ...transform.when, paramName: e.target.value, operator: transform.when?.operator || 'exists' },
              })}
              className="h-8 text-xs"
            />
            <select
              value={transform.when?.operator || 'exists'}
              onChange={(e) => onUpdate(index, {
                ...transform,
                when: {
                  paramName: transform.when?.paramName || '',
                  operator: e.target.value as NonNullable<TransformRule['when']>['operator'],
                  value: transform.when?.value,
                },
              })}
              className="h-8 text-xs rounded-md border border-input bg-background px-2"
            >
              <option value="eq">等于 (eq)</option>
              <option value="ne">不等于 (ne)</option>
              <option value="exists">存在 (exists)</option>
              <option value="not_exists">不存在 (not_exists)</option>
            </select>
            <Input
              placeholder="值（可选）"
              value={JSON.stringify(transform.when?.value) || ''}
              onChange={(e) => {
                try {
                  const val = e.target.value ? JSON.parse(e.target.value) : undefined
                  onUpdate(index, { ...transform, when: { paramName: transform.when?.paramName || '', operator: transform.when?.operator || 'exists', value: val } })
                } catch {
                  onUpdate(index, { ...transform, when: { paramName: transform.when?.paramName || '', operator: transform.when?.operator || 'exists', value: e.target.value } })
                }
              }}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">操作 (Action)</Label>
          <div className="grid grid-cols-3 gap-2">
            <select
              value={transform.action?.type || 'add'}
              onChange={(e) => onUpdate(index, { ...transform, action: { ...transform.action, type: e.target.value as TransformRule['action']['type'] } })}
              className="h-8 text-xs rounded-md border border-input bg-background px-2"
            >
              <option value="add">添加 (add)</option>
              <option value="remove">移除 (remove)</option>
              <option value="rename">重命名 (rename)</option>
              <option value="transform">转换 (transform)</option>
            </select>
            <Input
              placeholder="目标参数"
              value={transform.action?.targetParam || ''}
              onChange={(e) => onUpdate(index, { ...transform, action: { ...transform.action, targetParam: e.target.value } })}
              className="h-8 text-xs"
            />
            <Input
              placeholder="值或表达式"
              value={transform.action?.value !== undefined ? String(transform.action.value) : ''}
              onChange={(e) => onUpdate(index, { ...transform, action: { ...transform.action, value: e.target.value } })}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
