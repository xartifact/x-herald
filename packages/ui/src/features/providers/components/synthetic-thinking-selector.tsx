import { Label } from '../../../shared/components/ui/label'

interface SyntheticThinkingSelectorProps {
  value: 'strip' | 'inject'
  onChange: (value: 'strip' | 'inject') => void
}

export function SyntheticThinkingSelector({ value, onChange }: SyntheticThinkingSelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">合成 Thinking 策略</Label>
      <p className="text-xs text-muted-foreground">
        当对话历史中的 assistant 消息缺少 thinking 块（由非 thinking 模型生成）时的处理策略。
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange('strip')}
          className={`p-3 rounded-lg border text-left transition-colors ${
            value === 'strip'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/50'
          }`}
        >
          <div className="font-medium text-sm">strip（降级）</div>
          <div className="text-xs text-muted-foreground mt-1">
            移除 thinking 参数，以非 thinking 模式执行。安全，适用于有 signature 校验的 Provider。
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange('inject')}
          className={`p-3 rounded-lg border text-left transition-colors ${
            value === 'inject'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/50'
          }`}
        >
          <div className="font-medium text-sm">inject（注入）</div>
          <div className="text-xs text-muted-foreground mt-1">
            注入合成 thinking 块，保持 thinking 模式。适用于无 signature 校验的 Provider。
          </div>
        </button>
      </div>
    </div>
  )
}
