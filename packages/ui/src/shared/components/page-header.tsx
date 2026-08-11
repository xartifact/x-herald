import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
}

/**
 * 统一的页面标题区。替代各页面手写的 `<h1>/<h2> + 描述 + flex justify-between` 三件套。
 *
 * 渲染规范：h1 / text-2xl / font-bold / tracking-tight；描述 text-sm text-muted-foreground mt-1。
 */
export function PageHeader({ title, description, actions, icon }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          {icon}
          {title}
        </h1>
        {description ? <p className="text-sm text-muted-foreground mt-1">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export type { PageHeaderProps }
