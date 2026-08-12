import { Checkbox, Label } from '@xartifact/x-herald-ui'

import type { WidgetProps } from '@rjsf/utils'

import { WidgetShell } from './WidgetShell'

interface EnumOption {
  value: string
  label?: string
}

/**
 * RJSF MultiCheckboxWidget —— 枚举字符串数组多选,使用 shadcn Checkbox。
 *
 * 适用 schema 形态: `{ type: 'array', items: { type: 'string', enum: [...] } }`。
 * value 是 string[]（未选中为空数组）,onChange 回调整个新数组。
 * 注意不要与 CheckboxWidget（布尔单选框）混淆 —— 布尔字段用 CheckboxWidget,
 * 枚举多选用本组件。
 */
export function MultiCheckboxWidget(props: WidgetProps) {
  const { id, value, label, required, disabled, readonly, onChange, options } = props
  const selected = Array.isArray(value) ? value : []
  const enumOptions = (options.enumOptions ?? []) as EnumOption[]

  const toggle = (option: EnumOption, checked: boolean) => {
    const next = checked ? [...selected, option.value] : selected.filter((v) => v !== option.value)
    onChange(next)
  }

  return (
    <WidgetShell id={id} label={label} required={required}>
      <div className="space-y-1.5">
        {enumOptions.map((option) => (
          <label key={option.value} className="flex items-center gap-2 cursor-pointer text-sm">
            <Checkbox
              id={`${id}-${option.value}`}
              checked={selected.includes(option.value)}
              disabled={disabled || readonly}
              onCheckedChange={(checked) => toggle(option, checked === true)}
            />
            <Label htmlFor={`${id}-${option.value}`} className="text-sm font-normal cursor-pointer">
              {option.label ?? option.value}
            </Label>
          </label>
        ))}
      </div>
    </WidgetShell>
  )
}
