'use client'

import { useEffect, useState } from 'react'

import type { Node } from '@xyflow/react'
import { GitBranch } from 'lucide-react'

import { Input } from '@x-llm-gateway/ui'
import { Label } from '@x-llm-gateway/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@x-llm-gateway/ui'

import { FIELDS, NUMERIC_OPERATORS, STRING_OPERATORS, isNumericField } from './condition-fields'

interface ConditionNodeData {
  label?: string;
  field?: string;
  operator?: string;
  value?: unknown;
  [key: string]: unknown;
}

interface ConditionPropertiesProps {
  node: Node<ConditionNodeData>;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}


export function ConditionProperties({ node, onUpdate }: ConditionPropertiesProps) {
  const [label, setLabel] = useState(node.data.label ?? '')
  const [field, setField] = useState(node.data.field ?? '')
  const [operator, setOperator] = useState(node.data.operator ?? 'eq')
  const [value, setValue] = useState(String(node.data.value ?? ''))

  useEffect(() => {
    setLabel(node.data.label ?? '')
    setField(node.data.field ?? '')
    setOperator(node.data.operator ?? 'eq')
    setValue(String(node.data.value ?? ''))
  }, [node.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const operators = isNumericField(field) ? NUMERIC_OPERATORS : STRING_OPERATORS

  const update = (patch: Record<string, unknown>) => {
    onUpdate(node.id, { label, field, operator, value, ...node.data, ...patch })
  }

  const handleFieldChange = (v: string) => {
    const numeric = isNumericField(v)
    const validOps = (numeric ? NUMERIC_OPERATORS : STRING_OPERATORS).map((o) => o.value)
    const nextOp = validOps.includes(operator) ? operator : 'eq'
    setField(v)
    setOperator(nextOp)
    update({ field: v, operator: nextOp })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-600 font-semibold text-sm">
        <GitBranch className="h-4 w-4" />
        <span>条件节点配置</span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">显示名称</Label>
        <Input
          value={label}
          onChange={e => { setLabel(e.target.value); update({ label: e.target.value }) }}
          placeholder="条件名称（可选）"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">匹配字段</Label>
        <Select value={field} onValueChange={handleFieldChange}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="选择字段..." />
          </SelectTrigger>
          <SelectContent>
            {FIELDS.map(f => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">操作符</Label>
        <Select value={operator} onValueChange={v => { setOperator(v); update({ operator: v }) }}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="选择操作符..." />
          </SelectTrigger>
          <SelectContent>
            {operators.map(op => (
              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {operator !== 'exists' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {operator === 'in' ? '值（逗号分隔）' : '值'}
          </Label>
          <Input
            value={value}
            onChange={e => { setValue(e.target.value); update({ value: e.target.value }) }}
            placeholder={operator === 'in' ? '18,19,20,21,22' : operator === 'starts_with' ? 'premium-' : 'gpt-4'}
            className="h-8 text-sm font-mono"
          />
          {operator === 'in' && (
            <p className="text-xs text-muted-foreground">多个值用英文逗号分隔</p>
          )}
        </div>
      )}

      <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
        <p>True → 下一节点或目标</p>
        <p>False → 拒绝节点或其他分支</p>
      </div>
    </div>
  )
}
