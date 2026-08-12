import { useState } from 'react'

import { Plus, Trash2 } from 'lucide-react'

import { Button, Input, Label } from '@xartifact/x-herald-ui'

import type { FieldProps } from '@rjsf/utils'

import type { RemoteSelectOptions } from '../remote-sources'
import { RemoteSelectControl } from '../widgets/RemoteSelectControl'

interface RecordFieldOptions {
  /** 左侧 key 字段的标签，例如「意图名称」或「能力名称」 */
  keyLabel?: string
  /** 右侧 value 字段的标签，例如「模型组」 */
  valueLabel?: string
  /** value 远程数据源配置（默认 model-groups） */
  valueRemoteOptions?: RemoteSelectOptions
  /** value 占位符 */
  valuePlaceholder?: string
  /** value 是否使用 select（默认 true） */
  valueAsSelect?: boolean
  /** key 是否使用 select（用于固定枚举，如 capability） */
  keyAsSelect?: boolean
  /** key 的 select 选项 */
  keyOptions?: Array<{ value: string; label: string }>
  /** key 占位符 */
  keyPlaceholder?: string
}

/**
 * 自定义 RecordField —— 渲染 Record<string, string> 类型字段
 *
 * 用于意图路由 targetGroupIds / 能力路由 capabilityMap / 兜底组等场景。
 * 每行渲染一个 key 输入框（或 select） + value select + 删除按钮，
 * 顶部一个「添加」按钮新增空行。
 *
 * 所有内嵌下拉（key/value/新增 key）复用 RemoteSelectControl，享受统一能力集：
 *   - 远程搜索（searchable）
 *   - 懒加载（lazy + pageSize）
 *   - 清除按钮（hover X）
 *   - 加载状态（"加载中..."）
 *   - 级联数据源（dependsOn + remoteSourceMap）
 */
export function RecordField(props: FieldProps) {
  const { formData = {}, onChange, schema, uiSchema, title } = props
  const options = (uiSchema?.['ui:options'] as RecordFieldOptions | undefined) ?? {}
  const record = (formData ?? {}) as Record<string, string>
  const entries = Object.entries(record)

  const [newKey, setNewKey] = useState('')

  const valueRemoteOptions: RemoteSelectOptions = options.valueRemoteOptions ?? {
    remoteSource: 'model-groups',
    searchable: true,
    lazy: true,
    pageSize: 30,
  }

  const keyRemoteOptions: RemoteSelectOptions = {
    enumOptions: options.keyOptions ?? [],
  }

  const updateEntry = (oldKey: string, newKeyName: string, newValue: string) => {
    const next: Record<string, string> = {}
    for (const [k, v] of entries) {
      if (k === oldKey) {
        if (newKeyName) next[newKeyName] = newValue
      } else {
        next[k] = v
      }
    }
    onChange(next, props.fieldPathId.path)
  }

  const removeEntry = (key: string) => {
    const next: Record<string, string> = {}
    for (const [k, v] of entries) {
      if (k !== key) next[k] = v
    }
    onChange(next, props.fieldPathId.path)
  }

  const addEntry = () => {
    const key = newKey.trim()
    if (!key || key in record) return
    onChange({ ...record, [key]: '' }, props.fieldPathId.path)
    setNewKey('')
  }

  const triggerClass = 'h-8 text-sm flex-1'

  return (
    <div className="space-y-2">
      {title && (
        <Label className="text-xs text-muted-foreground">
          {title}
          {schema.description && <span className="ml-1 opacity-70">— {schema.description}</span>}
        </Label>
      )}

      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">点击下方「添加」创建第一个映射</p>
      )}

      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            {options.keyAsSelect &&
            keyRemoteOptions.enumOptions &&
            (keyRemoteOptions.enumOptions as Array<{ value: string; label: string }>).length > 0 ? (
              <RemoteSelectControl
                id={`${props.idSchema?.$id ?? 'r'}-key-${key}`}
                value={key}
                onChange={(v) => updateEntry(key, v ?? '', value)}
                options={keyRemoteOptions}
                allowClear={false}
                triggerClassName={triggerClass}
                placeholder={`选择${options.keyLabel ?? 'key'}`}
              />
            ) : (
              <Input
                value={key}
                onChange={(e) => updateEntry(key, e.target.value, value)}
                placeholder={options.keyLabel ?? 'key'}
                className="flex-1 h-8 text-sm"
              />
            )}

            {options.valueAsSelect === false ? (
              <Input
                value={value}
                onChange={(e) => updateEntry(key, key, e.target.value)}
                placeholder={options.valueLabel ?? 'value'}
                className="flex-1 h-8 text-sm"
              />
            ) : (
              <RemoteSelectControl
                id={`${props.idSchema?.$id ?? 'r'}-val-${key}`}
                value={value}
                onChange={(v) => updateEntry(key, key, v ?? '')}
                options={valueRemoteOptions}
                allowClear={true}
                triggerClassName={triggerClass}
                placeholder={options.valuePlaceholder ?? '选择模型组'}
              />
            )}

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => removeEntry(key)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        {options.keyAsSelect &&
        keyRemoteOptions.enumOptions &&
        (keyRemoteOptions.enumOptions as Array<{ value: string; label: string }>).length > 0 ? (
          <>
            <RemoteSelectControl
              value={newKey}
              onChange={(v) => {
                setNewKey(v ?? '')
                if (v && !(v in record)) {
                  onChange({ ...record, [v]: '' }, props.fieldPathId.path)
                  setNewKey('')
                }
              }}
              options={keyRemoteOptions}
              allowClear={false}
              triggerClassName={triggerClass}
              placeholder={`选择${options.keyLabel ?? 'key'}`}
            />
          </>
        ) : (
          <>
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addEntry()
                }
              }}
              placeholder={options.keyPlaceholder ?? `新增${options.keyLabel ?? 'key'}`}
              className="flex-1 h-8 text-sm"
            />
            <Button type="button" size="sm" variant="outline" onClick={addEntry} className="h-8">
              <Plus className="h-3 w-3 mr-1" />
              添加
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
