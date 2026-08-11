import type { WidgetProps } from '@rjsf/utils'

import { useNodeData } from '../index'
import { type RemoteSelectOptions } from '../remote-sources'
import { RemoteSelectControl } from './RemoteSelectControl'
import { WidgetShell } from './WidgetShell'

/**
 * RJSF Widget 适配器 — 将 RemoteSelectControl 接入 RJSF Widget 协议。
 *
 * 下拉 UI 逻辑（搜索/懒加载/清除按钮/级联）集中在 RemoteSelectControl 中实现，
 * 此处仅做 props 适配（WidgetProps → RemoteSelectControlProps + NodeDataContext → formData）。
 */
export function RemoteSelectWidget(props: WidgetProps) {
  const { id, value, required, disabled, readonly, onChange, onBlur, label } = props
  const options = (props.options as RemoteSelectOptions | undefined) ?? {}
  const formData = useNodeData()

  return (
    <WidgetShell id={id ?? 'remote-select'} label={label} required={required}>
      <RemoteSelectControl
        value={value as string | undefined}
        onChange={onChange}
        onBlur={onBlur}
        id={id}
        disabled={disabled}
        readonly={readonly}
        allowClear={options.allowClear}
        placeholder={options.placeholder}
        options={options}
        formData={formData}
      />
    </WidgetShell>
  )
}
