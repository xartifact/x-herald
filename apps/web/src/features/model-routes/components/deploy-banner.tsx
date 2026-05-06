'use client'

import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react'

import { Button } from '@/ui/button'

interface DeployBannerProps {
  isDirty: boolean
  isDeploying: boolean
  onDeploy: () => void
}

export function DeployBanner({ isDirty, isDeploying, onDeploy }: DeployBannerProps) {
  if (!isDirty && !isDeploying) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span>已同步</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-sm text-amber-600">
        <TriangleAlert className="h-4 w-4" />
        <span>有未部署的变更</span>
      </div>
      <Button
        size="sm"
        onClick={onDeploy}
        disabled={isDeploying}
        className="h-7 text-xs gap-1.5"
      >
        {isDeploying ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            部署中...
          </>
        ) : (
          '部署'
        )}
      </Button>
    </div>
  )
}
