import { useState } from 'react'

import { Button } from '@xartifact/x-llm-gateway-ui'
import { Check, Copy } from 'lucide-react'

interface CopyTextButtonProps {
  value: string
  label?: string
}

export function CopyTextButton({ value, label = '复制' }: CopyTextButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore — clipboard may be blocked in non-secure contexts */
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs text-muted-foreground"
      onClick={handleCopy}
      disabled={!value}
    >
      {copied ? (
        <>
          <Check className="mr-1 h-3 w-3" />
          已复制
        </>
      ) : (
        <>
          <Copy className="mr-1 h-3 w-3" />
          {label}
        </>
      )}
    </Button>
  )
}
