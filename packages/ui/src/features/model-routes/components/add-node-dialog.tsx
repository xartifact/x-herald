import { Button } from '../../../shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../shared/components/ui/dialog'

import type { NodeTemplate } from './flow-editor-constants'
import { NODE_TEMPLATES } from './flow-editor-constants'

interface AddNodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddNode: (template: NodeTemplate) => void
}

export function AddNodeDialog({ open, onOpenChange, onAddNode }: AddNodeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">选择节点类型</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          {NODE_TEMPLATES.map((t) => {
            const Icon = t.icon
            return (
              <Button
                key={t.type}
                variant="outline"
                className="h-auto flex-col items-start gap-1.5 p-3 text-left"
                onClick={() => onAddNode(t)}
              >
                <div className={`flex items-center gap-2 ${t.color} font-semibold text-xs`}>
                  <Icon className="h-4 w-4" />
                  {t.label}
                </div>
                <span className="text-[11px] text-muted-foreground font-normal leading-snug">
                  {t.desc}
                </span>
              </Button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
