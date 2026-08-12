import { Input } from '@xartifact/x-herald-ui'

import type { WidgetProps } from '@rjsf/utils'

import { WidgetShell } from './WidgetShell'

/**
 * RJSF NumberWidget —— 数字输入,使用 shadcn Input with type=number
 */
export function NumberWidget(props: WidgetProps) {
  const { id, value, required, disabled, readonly, onChange, onBlur, onFocus, label, placeholder } =
    props

  return (
    <WidgetShell id={id} label={label} required={required}>
      <Input
        id={id}
        type="number"
        value={value ?? ''}
        disabled={disabled || readonly}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? undefined : Number(v))
        }}
        onBlur={() => onBlur && onBlur(id, value)}
        onFocus={() => onFocus && onFocus(id, value)}
        className="h-8 text-sm"
      />
    </WidgetShell>
  )
}
