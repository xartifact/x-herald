import { Card, CardContent } from './ui'

interface EmptyStateProps {
  /** 不传则按 searchQuery 推断文案 */
  title?: string
  description?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  /** 区分"搜索无结果"与"尚未创建" */
  searchQuery?: string
}

/**
 * 统一的空状态。统一 padding（py-12）与结构，替代散落的内联空状态。
 *
 * - 有 searchQuery → "没有找到匹配的结果"（无 action）
 * - 无 searchQuery → "还没有数据"
 */
export function EmptyState({ title, description, icon, action, searchQuery }: EmptyStateProps) {
  const resolvedTitle = title ?? (searchQuery ? '没有找到匹配的结果' : '还没有数据')

  return (
    <Card>
      <CardContent className="py-12 text-center space-y-4">
        {icon ? <div className="flex justify-center text-muted-foreground">{icon}</div> : null}
        <p className="text-muted-foreground">{resolvedTitle}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {action ? <div className="flex justify-center">{action}</div> : null}
      </CardContent>
    </Card>
  )
}

export type { EmptyStateProps }
