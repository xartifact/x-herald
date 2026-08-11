import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react'

import { Button } from '../../../shared/components/ui/button'

interface DeployBannerProps {
  isDirty: boolean
  isDeploying: boolean
  onDeploy: () => void
  onDiscardDraft?: () => void
  onSaveDraft?: () => void
  isSavingDraft?: boolean
  validationErrorCount?: number
}

export function DeployBanner({
  isDirty,
  isDeploying,
  onDeploy,
  onDiscardDraft,
  onSaveDraft,
  isSavingDraft = false,
  validationErrorCount = 0,
}: DeployBannerProps) {
  if (!isDirty && !isDeploying && !isSavingDraft) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <span>已同步</span>
      </div>
    )
  }

  const ready = validationErrorCount === 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-sm text-warning">
        <TriangleAlert className="h-4 w-4" />
        <span>有未部署的变更</span>
      </div>
      {validationErrorCount > 0 && (
        <span className="text-xs text-destructive font-medium">{validationErrorCount} 项错误</span>
      )}
      {onDiscardDraft && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDiscardDraft}
          disabled={isDeploying || isSavingDraft}
          className="h-7 text-xs text-muted-foreground"
        >
          放弃草稿
        </Button>
      )}
      {onSaveDraft && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onSaveDraft}
          disabled={!ready || isDeploying || isSavingDraft}
          className="h-7 text-xs gap-1.5"
        >
          {isSavingDraft ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              保存中...
            </>
          ) : (
            '保存草稿'
          )}
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant={validationErrorCount > 0 ? 'destructive' : 'default'}
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
