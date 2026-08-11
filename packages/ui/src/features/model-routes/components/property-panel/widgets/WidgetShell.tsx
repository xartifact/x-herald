import type { ReactNode } from 'react'

import { Label } from '@xartifact/x-llm-gateway-ui'

interface WidgetShellProps {
  id: string
  label?: string
  required?: boolean
  children: ReactNode
}

/**
 * 共享 Widget 外壳 —— 封装 Label + 必填星号 + spacing
 * 消除 4 个 widget 之间的 14 行复制代码 (CPD 检出)
 */
export function WidgetShell({ id, label, required, children }: WidgetShellProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
      )}
      {children}
    </div>
  )
}
