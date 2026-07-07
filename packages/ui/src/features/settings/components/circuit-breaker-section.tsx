'use client'

import { useState } from 'react'

import { RefreshCw, ShieldAlert } from 'lucide-react'

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

import type { SettingsData } from '@xartifact/x-llm-gateway-shared'
import { useUpdateSettings } from '../hooks/use-settings'

interface CbFormState {
  failureThreshold: string
  openDurationSec: string
  maxBackoffSec: string
  cooldownTrips: string
  cooldownDurationSec: string
}

interface CircuitBreakerSectionProps {
  settings: SettingsData | undefined
  isLoading: boolean
}

export function CircuitBreakerSection({ settings, isLoading }: CircuitBreakerSectionProps) {
  const updateSettings = useUpdateSettings()
  const [cbForm, setCbForm] = useState<CbFormState | null>(null)

  const server = settings?.circuitBreaker ?? {
    failureThreshold: 3,
    openDurationMs: 60_000,
    maxBackoffMs: 300_000,
    maxTripsBeforeCooldown: 5,
    cooldownDurationMs: 1_800_000,
  }
  const threshold = cbForm?.failureThreshold ?? String(server.failureThreshold)
  const openSec = cbForm?.openDurationSec ?? String(Math.round(server.openDurationMs / 1000))
  const maxBackoffSec =
    cbForm?.maxBackoffSec ?? String(Math.round((server.maxBackoffMs || 300_000) / 1000))
  const cooldownTrips = cbForm?.cooldownTrips ?? String(server.maxTripsBeforeCooldown || 5)
  const cooldownSec =
    cbForm?.cooldownDurationSec ??
    String(Math.round((server.cooldownDurationMs || 1_800_000) / 1000))

  const patch = (key: keyof CbFormState, value: string) => {
    setCbForm((prev) =>
      prev
        ? { ...prev, [key]: value }
        : {
            failureThreshold: threshold,
            openDurationSec: openSec,
            maxBackoffSec,
            cooldownTrips,
            cooldownDurationSec: cooldownSec,
            [key]: value,
          },
    )
  }

  const handleSave = () => {
    const t = parseInt(threshold, 10),
      d = parseInt(openSec, 10)
    const mb = parseInt(maxBackoffSec, 10),
      ct = parseInt(cooldownTrips, 10),
      cd = parseInt(cooldownSec, 10)
    if (isNaN(t) || isNaN(d) || isNaN(mb) || isNaN(ct) || isNaN(cd)) return
    updateSettings.mutate(
      {
        circuitBreaker: {
          failureThreshold: t,
          openDurationMs: d * 1000,
          maxBackoffMs: mb * 1000,
          maxTripsBeforeCooldown: ct,
          cooldownDurationMs: cd * 1000,
        },
      },
      { onSuccess: () => setCbForm(null) },
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          <CardTitle>熔断器配置</CardTitle>
        </div>
        <CardDescription>
          模型实例连续失败达到阈值后自动熔断，保护下游请求。反复熔断将触发指数退避和冷却期机制。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">加载中...</div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-3">基础配置</h3>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="cb-threshold">失败阈值（次）</Label>
                  <Input
                    id="cb-threshold"
                    type="number"
                    min={1}
                    max={100}
                    value={threshold}
                    onChange={(e) => patch('failureThreshold', e.target.value)}
                    disabled={updateSettings.isPending}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">连续失败多少次后触发熔断</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cb-duration">基础熔断时长（秒）</Label>
                  <Input
                    id="cb-duration"
                    type="number"
                    min={10}
                    max={3600}
                    value={openSec}
                    onChange={(e) => patch('openDurationSec', e.target.value)}
                    disabled={updateSettings.isPending}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">首次熔断的等待时长</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">退避与冷却（高级）</h3>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                <div className="space-y-2">
                  <Label htmlFor="cb-max-backoff">最大退避时长（秒）</Label>
                  <Input
                    id="cb-max-backoff"
                    type="number"
                    min={10}
                    max={3600}
                    value={maxBackoffSec}
                    onChange={(e) => patch('maxBackoffSec', e.target.value)}
                    disabled={updateSettings.isPending}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">指数退避上限</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cb-cooldown-trips">冷却阈值（次）</Label>
                  <Input
                    id="cb-cooldown-trips"
                    type="number"
                    min={2}
                    max={20}
                    value={cooldownTrips}
                    onChange={(e) => patch('cooldownTrips', e.target.value)}
                    disabled={updateSettings.isPending}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">熔断多少次后进入冷却</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cb-cooldown-duration">冷却时长（秒）</Label>
                  <Input
                    id="cb-cooldown-duration"
                    type="number"
                    min={60}
                    max={7200}
                    value={cooldownSec}
                    onChange={(e) => patch('cooldownDurationSec', e.target.value)}
                    disabled={updateSettings.isPending}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">冷却期等待时长</p>
                </div>
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={updateSettings.isPending || cbForm === null}
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
