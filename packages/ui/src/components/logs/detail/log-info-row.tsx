'use client'

import { cn } from '../../../lib/utils'

interface InfoRowProps {
  label: string
  children: React.ReactNode
  className?: string
}

export function InfoRow({ label, children, className }: InfoRowProps) {
  return (
    <div className={cn('grid grid-cols-[120px_1fr] gap-2 text-sm py-2.5 px-4', className)}>
      <div className="text-muted-foreground font-medium">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
  className?: string
  badge?: React.ReactNode
  action?: React.ReactNode
}

export function Section({ title, children, className, badge, action }: SectionProps) {
  return (
    <div className={cn('border-b last:border-b-0', className)}>
      <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold">{title}</h4>
          {badge}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  )
}
