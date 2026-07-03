import { Plus } from 'lucide-react'

import { Button } from '../../../shared/components/ui/button'

// Record<string, any> defined locally // TODO(6): from apps/web
import { TransformRuleCard } from './transform-rule-card'

type TransformRule = NonNullable<
  NonNullable<Record<string, any>['config']>['parameterTransforms']
>[0]

interface TransformsTabProps {
  transforms: TransformRule[]
  onAdd: () => void
  onUpdate: (index: number, transform: TransformRule) => void
  onRemove: (index: number) => void
}

export function TransformsTab({ transforms, onAdd, onUpdate, onRemove }: TransformsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">参数转换规则</h4>
          <p className="text-xs text-muted-foreground">定义请求参数的转换规则，支持条件判断</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />
          添加规则
        </Button>
      </div>

      {transforms.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
          暂无转换规则，点击上方按钮添加
        </div>
      )}

      {transforms.map((transform) => (
        <TransformRuleCard
          key={transform.id ?? `transform-${transform.name ?? 'unknown'}`}
          transform={transform}
          index={index}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}

      <div className="text-xs text-muted-foreground">
        <p>支持的表达式格式：</p>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>
            <code>{'${reasoning.enabled} ? true : false'}</code> - 三元表达式
          </li>
          <li>
            <code>{'${temperature}'}</code> - 引用请求参数
          </li>
        </ul>
      </div>
    </div>
  )
}
