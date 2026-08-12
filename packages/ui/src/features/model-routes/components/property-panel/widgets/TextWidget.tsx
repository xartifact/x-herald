import { Input } from '@xartifact/x-herald-ui'

import type { WidgetProps } from '@rjsf/utils'

import { WidgetShell } from './WidgetShell'

/**
 * RJSF TextWidget —— 字符串输入,使用 shadcn Input
 */
export function TextWidget(props: WidgetProps) {
  const { id, value, required, disabled, readonly, onChange, onBlur, onFocus, label, placeholder } =
    props

  return (
    <WidgetShell id={id} label={label} required={required}>
      <Input
        id={id}
        value={value ?? ''}
        disabled={disabled || readonly}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        onBlur={() => onBlur && onBlur(id, value)}
        onFocus={() => onFocus && onFocus(id, value)}
        className="h-8 text-sm"
      />
    </WidgetShell>
  )
}
