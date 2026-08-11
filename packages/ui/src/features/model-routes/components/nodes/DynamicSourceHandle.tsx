import type { ReactNode } from 'react'

import { Handle, Position } from '@xyflow/react'

interface DynamicSourceHandleProps {
  id: string
  label: ReactNode
  color: 'violet' | 'cyan'
  position: number
  total: number
  connected?: boolean
}

const COLOR_MAP = {
  violet: {
    solid: '!bg-violet-500',
    soft: '!bg-violet-300',
    pill: 'bg-violet-100/90 text-violet-700 ring-violet-200',
  },
  cyan: {
    solid: '!bg-cyan-500',
    soft: '!bg-cyan-300',
    pill: 'bg-cyan-100/90 text-cyan-700 ring-cyan-200',
  },
} as const

/**
 * 共享动态 source handle 渲染 —— 标签置于 handle 上方（节点内部）,
 * handle 置于节点底边。这样多个 handle 横向排列时,标签不会与相邻 handle 重叠。
 *
 * 视觉布局:
 *   ┌─────────────────┐
 *   │ 节点内容         │
 *   ├─────────────────┤
 *   │ [pill] [pill] [pill]  ← 标签在节点内底部
 *   ├─────────────────┤
 *   │   ●   ●   ●        ← handle 在节点底边
 *   └─────────────────┘
 */
export function DynamicSourceHandle({
  id,
  label,
  color,
  position,
  total,
  connected = true,
}: DynamicSourceHandleProps) {
  const colors = COLOR_MAP[color]
  const left = `${((position + 1) * 100) / (total + 1)}%`
  const handleColor = connected ? colors.solid : colors.soft

  return (
    <div
      className="absolute bottom-0 flex flex-col-reverse items-center pointer-events-none"
      style={{ left, transform: 'translateX(-50%)' }}
    >
      <Handle
        type="source"
        id={id}
        position={Position.Bottom}
        className={`${handleColor} !w-3 !h-3 relative !transform-none !left-auto !top-auto pointer-events-auto ${connected ? '' : 'opacity-50 ring-2 ring-offset-1 ring-dashed'}`}
      />
      <span
        className={`mb-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[56px] ring-1 ${colors.pill}`}
        title={typeof label === 'string' ? label : undefined}
      >
        {label}
      </span>
    </div>
  )
}
