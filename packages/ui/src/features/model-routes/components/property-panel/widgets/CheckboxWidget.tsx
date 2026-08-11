import { Checkbox, Label } from '@xartifact/x-llm-gateway-ui'

import type { WidgetProps } from '@rjsf/utils'

/**
 * RJSF CheckboxWidget —— 布尔值,使用 shadcn Checkbox
 */
export function CheckboxWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, onChange, label } = props

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={!!value}
        disabled={disabled || readonly}
        onCheckedChange={(checked) => onChange(checked === true)}
      />
      {label && (
        <Label htmlFor={id} className="text-sm cursor-pointer">
          {label}
        </Label>
      )}
    </div>
  )
}
