'use client'

import { useRef, useState } from 'react'

import { AlertTriangle, Bot, Download, RefreshCw, ShieldAlert, Upload } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'

import { useSettings, useUpdateSettings } from './useSettings'
import type { ImportResult } from '../config-io/types'
import { useExportConfig, useImportConfig } from '../config-io/useConfigIO'

const NONE_VALUE = '__none__'

export default function SettingsPage() {
  const exportConfig = useExportConfig()
  const importConfig = useImportConfig()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const { data: settings, isLoading: settingsLoading } = useSettings()
  const updateSettings = useUpdateSettings()

  const [selectedGroupId, setSelectedGroupId] = useState<string | null | undefined>(undefined)
  const currentGroupId =
    selectedGroupId === undefined
      ? (settings?.aiModelGroupId ?? null)
      : selectedGroupId

  const [cbForm, setCbForm] = useState<{
    failureThreshold: string
    openDurationSec: string
    maxBackoffSec: string
    cooldownTrips: string
    cooldownDurationSec: string
  } | null>(null)

  const serverCb = settings?.circuitBreaker ?? { failureThreshold: 3, openDurationMs: 60_000, maxBackoffMs: 300_000, maxTripsBeforeCooldown: 5, cooldownDurationMs: 1_800_000 }
  const cbFailureThreshold = cbForm?.failureThreshold ?? String(serverCb.failureThreshold)
  const cbOpenDurationSec = cbForm?.openDurationSec ?? String(Math.round(serverCb.openDurationMs / 1000))
  const cbMaxBackoffSec = cbForm?.maxBackoffSec ?? String(Math.round((serverCb.maxBackoffMs || 300_000) / 1000))
  const cbCooldownTrips = cbForm?.cooldownTrips ?? String(serverCb.maxTripsBeforeCooldown || 5)
  const cbCooldownDurationSec = cbForm?.cooldownDurationSec ?? String(Math.round((serverCb.cooldownDurationMs || 1_800_000) / 1000))

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await importConfig.mutateAsync(file)
    setImportResult(result)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSaveDefaultModel = () => {
    updateSettings.mutate(
      { aiModelGroupId: currentGroupId ?? null },
      { onSuccess: () => setSelectedGroupId(undefined) }
    )
  }

  const handleSaveCircuitBreaker = () => {
    const threshold = parseInt(cbFailureThreshold, 10)
    const durationSec = parseInt(cbOpenDurationSec, 10)
    const maxBackoffSec = parseInt(cbMaxBackoffSec, 10)
    const cooldownTrips = parseInt(cbCooldownTrips, 10)
    const cooldownDurationSec = parseInt(cbCooldownDurationSec, 10)
    if (isNaN(threshold) || isNaN(durationSec) || isNaN(maxBackoffSec) || isNaN(cooldownTrips) || isNaN(cooldownDurationSec)) return

    updateSettings.mutate(
      {
        circuitBreaker: {
          failureThreshold: threshold,
          openDurationMs: durationSec * 1000,
          maxBackoffMs: maxBackoffSec * 1000,
          maxTripsBeforeCooldown: cooldownTrips,
          cooldownDurationMs: cooldownDurationSec * 1000,
        },
      },
      { onSuccess: () => setCbForm(null) }
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">系统设置</h2>
        <p className="text-muted-foreground">管理网关全局配置</p>
      </div>

      {/* AI 模型配置 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle>AI 功能模型</CardTitle>
          </div>
          <CardDescription>
            所有内置 AI 功能（日志分析、配置助手等）使用的模型。未配置时自动选择第一个可用实例。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settingsLoading ? (
            <div className="text-sm text-muted-foreground">加载中...</div>
          ) : (
            <div className="flex items-center gap-3">
              <Select
                value={currentGroupId ?? NONE_VALUE}
                onValueChange={(v) => setSelectedGroupId(v === NONE_VALUE ? null : v)}
                disabled={updateSettings.isPending}
              >
                <SelectTrigger className="w-[360px]">
                  <SelectValue placeholder="自动选择（使用第一个可用实例）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>
                    <span className="text-muted-foreground">自动选择</span>
                  </SelectItem>
                  {settings?.availableModelGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      <span>{group.displayName || group.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {group.name} · {group.instanceCount} 个实例
                      </span>
                    </SelectItem>
                  ))}
                  {settings?.availableModelGroups.length === 0 && (
                    <SelectItem value={NONE_VALUE} disabled>
                      暂无模型组，请先创建
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>

              <Button
                onClick={handleSaveDefaultModel}
                disabled={updateSettings.isPending || selectedGroupId === undefined}
                size="sm"
              >
                {updateSettings.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                保存
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 熔断器配置 */}
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
          {settingsLoading ? (
            <div className="text-sm text-muted-foreground">加载中...</div>
          ) : (
            <div className="space-y-4">
              {/* 基础配置 */}
              <div>
                <h3 className="text-sm font-medium mb-3">基础配置</h3>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="cb-threshold">失败阈值（次）</Label>
                    <Input id="cb-threshold" type="number" min={1} max={100} value={cbFailureThreshold}
                      onChange={(e) => setCbForm((prev) => prev ? { ...prev, failureThreshold: e.target.value } : { failureThreshold: e.target.value, openDurationSec: '', maxBackoffSec: '', cooldownTrips: '', cooldownDurationSec: '' })}
                      disabled={updateSettings.isPending} className="w-full" />
                    <p className="text-xs text-muted-foreground">连续失败多少次后触发熔断</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cb-duration">基础熔断时长（秒）</Label>
                    <Input id="cb-duration" type="number" min={10} max={3600} value={cbOpenDurationSec}
                      onChange={(e) => setCbForm((prev) => prev ? { ...prev, openDurationSec: e.target.value } : { failureThreshold: '', openDurationSec: e.target.value, maxBackoffSec: '', cooldownTrips: '', cooldownDurationSec: '' })}
                      disabled={updateSettings.isPending} className="w-full" />
                    <p className="text-xs text-muted-foreground">首次熔断的等待时长</p>
                  </div>
                </div>
              </div>

              {/* 高级配置 */}
              <div>
                <h3 className="text-sm font-medium mb-3">退避与冷却（高级）</h3>
                <div className="grid grid-cols-3 gap-4 max-w-lg">
                  <div className="space-y-2">
                    <Label htmlFor="cb-max-backoff">最大退避时长（秒）</Label>
                    <Input id="cb-max-backoff" type="number" min={10} max={3600} value={cbMaxBackoffSec}
                      onChange={(e) => setCbForm((prev) => prev ? { ...prev, maxBackoffSec: e.target.value } : { failureThreshold: '', openDurationSec: '', maxBackoffSec: e.target.value, cooldownTrips: '', cooldownDurationSec: '' })}
                      disabled={updateSettings.isPending} className="w-full" />
                    <p className="text-xs text-muted-foreground">指数退避上限</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cb-cooldown-trips">冷却阈值（次）</Label>
                    <Input id="cb-cooldown-trips" type="number" min={2} max={20} value={cbCooldownTrips}
                      onChange={(e) => setCbForm((prev) => prev ? { ...prev, cooldownTrips: e.target.value } : { failureThreshold: '', openDurationSec: '', maxBackoffSec: '', cooldownTrips: e.target.value, cooldownDurationSec: '' })}
                      disabled={updateSettings.isPending} className="w-full" />
                    <p className="text-xs text-muted-foreground">熔断多少次后进入冷却</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cb-cooldown-duration">冷却时长（秒）</Label>
                    <Input id="cb-cooldown-duration" type="number" min={60} max={7200} value={cbCooldownDurationSec}
                      onChange={(e) => setCbForm((prev) => prev ? { ...prev, cooldownDurationSec: e.target.value } : { failureThreshold: '', openDurationSec: '', maxBackoffSec: '', cooldownTrips: '', cooldownDurationSec: e.target.value })}
                      disabled={updateSettings.isPending} className="w-full" />
                    <p className="text-xs text-muted-foreground">冷却期等待时长</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSaveCircuitBreaker}
                disabled={updateSettings.isPending || cbForm === null}
                size="sm"
              >
                {updateSettings.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                保存
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 配置导入 / 导出 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            <CardTitle>配置导入 / 导出</CardTitle>
          </div>
          <CardDescription>
            导出或导入供应商、模型组、模型实例、虚拟模型、路由规则、虚拟密钥和网关配置
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => exportConfig.mutate()} disabled={exportConfig.isPending}>
              {exportConfig.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              导出配置
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importConfig.isPending}>
              {importConfig.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              导入配置
            </Button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          </div>

          {importResult && (
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <p className="font-medium">导入结果</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-muted-foreground">
                {(
                  [
                    ['供应商', 'providers'], ['模型组', 'modelGroups'], ['模型实例', 'modelInstances'],
                    ['虚拟模型', 'virtualModels'], ['路由规则', 'modelRoutes'], ['虚拟密钥', 'virtualKeys'],
                    ['网关配置', 'gatewayConfigs'],
                  ] as const
                ).map(([label, key]) => {
                  const s = importResult.summary[key]
                  return (
                    <div key={key} className="contents">
                      <span>{label}</span>
                      <span className="text-green-600">+{s.created} 新增</span>
                      <span className="text-blue-600">↺{s.updated} 更新</span>
                    </div>
                  )
                })}
              </div>
              {importResult.errors.length > 0 && (
                <Alert variant="destructive" className="mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>部分错误</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1">
                      {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
