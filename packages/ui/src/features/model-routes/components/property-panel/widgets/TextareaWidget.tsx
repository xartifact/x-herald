import { Textarea } from '@xartifact/x-llm-gateway-ui'

import type { WidgetProps } from '@rjsf/utils'

import { WidgetShell } from './WidgetShell'

/**
 * RJSF TextareaWidget —— 多行字符串,使用 shadcn Textarea
 * 通过 ui:options: { rows: N } 可调整行数
 */
export function TextareaWidget(props: WidgetProps) {
  const { id, value, required, disabled, readonly, onChange, onBlur, onFocus, label, placeholder } =
    props
  const rows = (props.options?.rows as number) ?? 3

  return (
    <WidgetShell id={id} label={label} required={required}>
      <Textarea
        id={id}
        value={value ?? ''}
        disabled={disabled || readonly}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        onBlur={() => onBlur && onBlur(id, value)}
        onFocus={() => onFocus && onFocus(id, value)}
        className="text-sm resize-none"
      />
    </WidgetShell>
  )
}
