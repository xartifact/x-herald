import { useState } from 'react'

import { Plus, X } from 'lucide-react'

import { Badge, Button, Input } from '@xartifact/x-llm-gateway-ui'

import type { FieldProps } from '@rjsf/utils'

export function CategoryListField(props: FieldProps) {
  const { formData = [], onChange, schema, title } = props
  const items = (formData ?? []) as string[]
  const [newItem, setNewItem] = useState('')

  const addItem = () => {
    const trimmed = newItem.trim()
    if (!trimmed || items.includes(trimmed)) return
    onChange([...items, trimmed], props.fieldPathId.path)
    setNewItem('')
  }

  const removeItem = (index: number) => {
    onChange(
      items.filter((_, i) => i !== index),
      props.fieldPathId.path,
    )
  }

  return (
    <div className="space-y-2">
      {title && <label className="text-xs text-muted-foreground">{title}</label>}
      {schema.description && (
        <p className="text-[11px] text-muted-foreground opacity-70">{schema.description}</p>
      )}
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">点击下方添加第一个分类</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <Badge key={item} variant="secondary" className="gap-1 pr-1">
            <span className="text-xs">{item}</span>
            <button type="button" onClick={() => removeItem(i)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addItem()
            }
          }}
          placeholder="新增分类"
          className="flex-1 h-8 text-sm"
        />
        <Button type="button" size="sm" variant="outline" onClick={addItem} className="h-8">
          <Plus className="h-3 w-3 mr-1" />
          添加
        </Button>
      </div>
    </div>
  )
}
