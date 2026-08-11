import { useState } from 'react'

import { Clock, RefreshCw } from 'lucide-react'

import { Button } from '../../../shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../shared/components/ui/card'
import { Input } from '../../../shared/components/ui/input'
import { Label } from '../../../shared/components/ui/label'

import {
  DEFAULT_TTFB_TIMEOUT_CONFIG,
  type SettingsData,
  type TtfbTimeoutConfig,
} from '@xartifact/x-llm-gateway-shared'
import { useUpdateSettings } from '../hooks/use-settings'

interface FormState {
  totalStreamingSec: string
  totalNonStreamingSec: string
  attemptStreamingSec: string
  attemptNonStreamingSec: string
  minAttemptSec: string
  baselineMultiplier: string
}

interface TtfbTimeoutSectionProps {
  settings: SettingsData | undefined
  isLoading: boolean
}

function toForm(cfg: TtfbTimeoutConfig): FormState {
  return {
    totalStreamingSec: String(Math.round(cfg.totalStreamingMs / 1000)),
    totalNonStreamingSec: String(Math.round(cfg.totalNonStreamingMs / 1000)),
    attemptStreamingSec: String(Math.round(cfg.attemptStreamingMs / 1000)),
    attemptNonStreamingSec: String(Math.round(cfg.attemptNonStreamingMs / 1000)),
    minAttemptSec: String(Math.round(cfg.minAttemptMs / 1000)),
    baselineMultiplier: String(cfg.baselineMultiplier),
  }
}

export function TtfbTimeoutSection({ settings, isLoading }: TtfbTimeoutSectionProps) {
  const updateSettings = useUpdateSettings()
  const [form, setForm] = useState<FormState | null>(null)

  const server = settings?.ttfbTimeout ?? DEFAULT_TTFB_TIMEOUT_CONFIG
  const serverForm = toForm(server)
  const current: FormState = form ?? serverForm

  const patch = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...(prev ?? serverForm), [key]: value }))
  }

  const handleSave = () => {
    const totalStreamingMs = parseInt(current.totalStreamingSec, 10) * 1000
    const totalNonStreamingMs = parseInt(current.totalNonStreamingSec, 10) * 1000
    const attemptStreamingMs = parseInt(current.attemptStreamingSec, 10) * 1000
    const attemptNonStreamingMs = parseInt(current.attemptNonStreamingSec, 10) * 1000
    const minAttemptMs = parseInt(current.minAttemptSec, 10) * 1000
    const baselineMultiplier = parseFloat(current.baselineMultiplier)

    if (
      [
        totalStreamingMs,
        totalNonStreamingMs,
        attemptStreamingMs,
        attemptNonStreamingMs,
        minAttemptMs,
      ].some((n) => !Number.isFinite(n) || n <= 0) ||
      !Number.isFinite(baselineMultiplier)
    ) {
      return
    }

    const payload: TtfbTimeoutConfig = {
      totalStreamingMs,
      totalNonStreamingMs,
      attemptStreamingMs,
      attemptNonStreamingMs,
      minAttemptMs,
      baselineMultiplier,
    }

    updateSettings.mutate({ ttfbTimeout: payload }, { onSuccess: () => setForm(null) })
  }

  const attemptWarn =
    parseInt(current.attemptStreamingSec, 10) >= parseInt(current.totalStreamingSec, 10) ||
    parseInt(current.attemptNonStreamingSec, 10) >= parseInt(current.totalNonStreamingSec, 10)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          <CardTitle>TTFB 超时配置</CardTitle>
        </div>
        <CardDescription>
          控制上游首字节等待时间。全局预算耗尽后返回 504
          并停止故障转移；单次尝试超时后可切换下一候选实例。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">加载中...</div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-3">全局预算（Total）</h3>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="ttfb-total-stream">流式（秒）</Label>
                  <Input
                    id="ttfb-total-stream"
                    type="number"
                    min={5}
                    max={600}
                    value={current.totalStreamingSec}
                    onChange={(e) => patch('totalStreamingSec', e.target.value)}
                    disabled={updateSettings.isPending}
                  />
                  <p className="text-xs text-muted-foreground">整请求最长等待，超时即 504</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ttfb-total-nonstream">非流式（秒）</Label>
                  <Input
                    id="ttfb-total-nonstream"
                    type="number"
                    min={5}
                    max={600}
                    value={current.totalNonStreamingSec}
                    onChange={(e) => patch('totalNonStreamingSec', e.target.value)}
                    disabled={updateSettings.isPending}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">单次尝试（Attempt）</h3>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="ttfb-attempt-stream">流式（秒）</Label>
                  <Input
                    id="ttfb-attempt-stream"
                    type="number"
                    min={5}
                    max={600}
                    value={current.attemptStreamingSec}
                    onChange={(e) => patch('attemptStreamingSec', e.target.value)}
                    disabled={updateSettings.isPending}
                  />
                  <p className="text-xs text-muted-foreground">单候选等待上限，超时可 failover</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ttfb-attempt-nonstream">非流式（秒）</Label>
                  <Input
                    id="ttfb-attempt-nonstream"
                    type="number"
                    min={5}
                    max={600}
                    value={current.attemptNonStreamingSec}
                    onChange={(e) => patch('attemptNonStreamingSec', e.target.value)}
                    disabled={updateSettings.isPending}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">自适应参数</h3>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="ttfb-min">最小 attempt（秒）</Label>
                  <Input
                    id="ttfb-min"
                    type="number"
                    min={5}
                    max={600}
                    value={current.minAttemptSec}
                    onChange={(e) => patch('minAttemptSec', e.target.value)}
                    disabled={updateSettings.isPending}
                  />
                  <p className="text-xs text-muted-foreground">无 baseline 时的下限</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ttfb-mult">基线倍率</Label>
                  <Input
                    id="ttfb-mult"
                    type="number"
                    min={1}
                    max={10}
                    step={0.1}
                    value={current.baselineMultiplier}
                    onChange={(e) => patch('baselineMultiplier', e.target.value)}
                    disabled={updateSettings.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    attempt ≈ max(P95×倍率, 最小, 配置)
                  </p>
                </div>
              </div>
            </div>

            {attemptWarn && (
              <p className="text-xs text-warning">
                单次 attempt ≥ 全局预算时，几乎无法切换到下一候选实例。
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              实际 attempt = min(max(实例 TTFB_P95 × 倍率, 最小, 单次配置/实例覆盖), 剩余预算)
            </p>

            <Button
              onClick={handleSave}
              disabled={updateSettings.isPending || form === null}
              size="sm"
            >
              {updateSettings.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
