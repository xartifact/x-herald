import { Input } from '../../../shared/components/ui/input'
import { Label } from '../../../shared/components/ui/label'

export interface TimeoutConfigFields {
  connectTimeoutMs?: number
  ttfbTimeoutMs?: number
  connectTimeout?: number
  readTimeout?: number
}

interface TimeoutTabProps {
  timeoutConfig?: TimeoutConfigFields
  onChange: (next: TimeoutConfigFields | undefined) => void
}

function msToSecDisplay(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return ''
  return String(Math.round(ms / 1000))
}

function parseSecToMs(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const sec = parseFloat(trimmed)
  if (!Number.isFinite(sec) || sec <= 0) return undefined
  return Math.round(sec * 1000)
}

export function TimeoutTab({ timeoutConfig, onChange }: TimeoutTabProps) {
  const connectMs = timeoutConfig?.connectTimeoutMs ?? timeoutConfig?.connectTimeout
  const ttfbMs = timeoutConfig?.ttfbTimeoutMs ?? timeoutConfig?.readTimeout

  const emit = (patch: Partial<TimeoutConfigFields>) => {
    const next: TimeoutConfigFields = {
      connectTimeoutMs: connectMs,
      ttfbTimeoutMs: ttfbMs,
      ...patch,
    }
    // 清除 legacy 字段，统一写入新命名
    delete next.connectTimeout
    delete next.readTimeout

    const hasConnect = next.connectTimeoutMs != null
    const hasTtfb = next.ttfbTimeoutMs != null
    if (!hasConnect && !hasTtfb) {
      onChange(undefined)
      return
    }
    onChange({
      ...(hasConnect ? { connectTimeoutMs: next.connectTimeoutMs } : {}),
      ...(hasTtfb ? { ttfbTimeoutMs: next.ttfbTimeoutMs } : {}),
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        留空则使用系统设置中的全局默认值。仅对本实例生效。
      </p>
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="inst-connect-timeout">建连超时（秒）</Label>
          <Input
            id="inst-connect-timeout"
            type="number"
            min={1}
            max={600}
            placeholder="默认 30"
            value={msToSecDisplay(connectMs)}
            onChange={(e) => emit({ connectTimeoutMs: parseSecToMs(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">TCP/TLS 连接超时（connectTimeoutMs）</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="inst-ttfb-timeout">TTFB 超时（秒）</Label>
          <Input
            id="inst-ttfb-timeout"
            type="number"
            min={1}
            max={600}
            placeholder="使用全局 attempt"
            value={msToSecDisplay(ttfbMs)}
            onChange={(e) => emit({ ttfbTimeoutMs: parseSecToMs(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">
            覆盖单次 attempt 基准（仍受全局 total 预算限制）
          </p>
        </div>
      </div>
    </div>
  )
}
