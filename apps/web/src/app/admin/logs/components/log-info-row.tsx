'use client'

import { useState } from 'react'

import { Copy, Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/core/lib/utils'

interface InfoRowProps {
  label: string
  value: string | React.ReactNode
  copyable?: boolean
  mono?: boolean
}

export function InfoRow({ label, value, copyable = false, mono = false }: InfoRowProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (typeof value === 'string') {
      navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex items-start py-2.5 px-4 hover:bg-accent/50 transition-colors group">
      <div className="w-32 flex-shrink-0 text-sm text-muted-foreground font-medium">
        {label}
      </div>
      <div className={cn(
        "flex-1 text-sm",
        mono && "font-mono"
      )}>
        {value}
      </div>
      {copyable && typeof value === 'string' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
  badge?: React.ReactNode
  action?: React.ReactNode
}

export function Section({ title, children, badge, action }: SectionProps) {
  return (
    <div className="border-b last:border-b-0">
      <div className="px-4 py-2.5 bg-muted/30 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {badge}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  )
}