'use client'

import { useEffect, useState } from 'react'

import type { Node } from '@xyflow/react'
import { GitBranch } from 'lucide-react'

import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'

const FIELDS = [
  { value: 'request.model', label: '模型名 (request.model)', numeric: false },
  { value: 'context.apiKeyName', label: 'API Key 名称 (context.apiKeyName)', numeric: false },
  { value: 'context.streaming', label: '是否流式 (context.streaming)', numeric: false },
  { value: 'context.hour', label: '当前小时 (context.hour)', numeric: true },
  { value: 'context.clientType', label: '客户端类型 (context.clientType)', numeric: false },
  { value: 'perf.anomalyLevel', label: '实例异常等级 (perf.anomalyLevel)', numeric: false },
  { value: 'perf.anomalyScore', label: '最高异常分数 (perf.anomalyScore)', numeric: true },
  { value: 'perf.successRate', label: '最低成功率 0~1 (perf.successRate)', numeric: true },
  { value: 'perf.ttfbP95', label: '最高 TTFB P95 ms (perf.ttfbP95)', numeric: true },
  { value: 'perf.healthyRatio', label: '健康实例占比 0~1 (perf.healthyRatio)', numeric: true },
]

const STRING_OPERATORS = [
  { value: 'eq', label: '等于 (eq)' },
  { value: 'ne', label: '不等于 (ne)' },
  { value: 'in', label: '在列表中 (in)' },
  { value: 'starts_with', label: '开头匹配 (starts_with)' },
  { value: 'exists', label: '存在 (exists)' },
]

const NUMERIC_OPERATORS = [
  { value: 'eq', label: '等于 (eq)' },
  { value: 'ne', label: '不等于 (ne)' },
  { value: 'gt', label: '大于 (>)' },
  { value: 'lt', label: '小于 (<)' },
  { value: 'gte', label: '大于等于 (>=)' },
  { value: 'lte', label: '小于等于 (<=)' },
]

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

function isNumericField(f: string): boolean {
  return FIELDS.find((x) => x.value === f)?.numeric ?? false
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
