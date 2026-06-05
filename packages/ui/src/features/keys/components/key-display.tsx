'use client'

import { Eye, EyeOff, Copy, Check } from 'lucide-react'

import { Button } from '../../../shared/components/ui/button'

interface KeyDisplayProps {
  keyValue: string
  showKey: boolean
  copied: boolean
  onToggleShow: () => void
  onCopy: () => void
}

export function KeyDisplay({ keyValue, showKey, copied, onToggleShow, onCopy }: KeyDisplayProps) {
  return (
    <div className="flex items-center gap-2">
      <code className="text-xs text-muted-foreground font-mono">
        {showKey
          ? keyValue
          : `${keyValue.slice(0, 8)}...${keyValue.slice(-4)}`}
      </code>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={onToggleShow}
      >
        {showKey ? (
          <EyeOff className="h-3 w-3" />
        ) : (
          <Eye className="h-3 w-3" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={onCopy}
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  )
}

interface KeyAlertProps {
  keyValue: string
  copied: boolean
  onCopy: () => void
}

export function KeyAlert({ keyValue, copied, onCopy }: KeyAlertProps) {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
      <p className="font-medium text-yellow-800 mb-2">
        请保存您的 API 密钥，它只显示一次！
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-yellow-100 px-2 py-1 rounded text-sm font-mono break-all">
          {keyValue}
        </code>
        <Button size="sm" variant="outline" onClick={onCopy}>
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
