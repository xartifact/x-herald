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

  // AI 模型配置状态
  const [selectedGroupId, setSelectedGroupId] = useState<string | null | undefined>(undefined)
  const currentGroupId =
    selectedGroupId === undefined
      ? (settings?.aiModelGroupId ?? null)
      : selectedGroupId

  // 熔断器配置状态（null = 未修改，显示服务端值）
  const [cbForm, setCbForm] = useState<{ failureThreshold: string; openDurationSec: string } | null>(null)
  const serverCb = settings?.circuitBreaker ?? { failureThreshold: 3, openDurationMs: 60_000 }
  const cbFailureThreshold = cbForm?.failureThreshold ?? String(serverCb.failureThreshold)
  const cbOpenDurationSec = cbForm?.openDurationSec ?? String(Math.round(serverCb.openDurationMs / 1000))

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
    if (isNaN(threshold) || isNaN(durationSec)) return

    updateSettings.mutate(
      { circuitBreaker: { failureThreshold: threshold, openDurationMs: durationSec * 1000 } },
      { onSuccess: () => setCbForm(null) }
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">系统设置</h2>
        <p className="text-muted-foreground">管理网关全局配置</p>
      </div>

      {/* 应用默认模型 */}
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
            模型实例连续失败达到阈值后自动熔断，保护下游请求。熔断期间该实例将被跳过，优先转移到其他实例。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsLoading ? (
            <div className="text-sm text-muted-foreground">加载中...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="cb-threshold">失败阈值（次）</Label>
                  <Input
                    id="cb-threshold"
                    type="number"
                    min={1}
                    max={100}
                    value={cbFailureThreshold}
                    onChange={(e) =>
                      setCbForm((prev) => ({
                        failureThreshold: e.target.value,
                        openDurationSec: prev?.openDurationSec ?? cbOpenDurationSec,
                      }))
                    }
                    disabled={updateSettings.isPending}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">连续失败多少次后触发熔断</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cb-duration">熔断持续时间（秒）</Label>
                  <Input
                    id="cb-duration"
                    type="number"
                    min={10}
                    max={3600}
                    value={cbOpenDurationSec}
                    onChange={(e) =>
                      setCbForm((prev) => ({
                        failureThreshold: prev?.failureThreshold ?? cbFailureThreshold,
                        openDurationSec: e.target.value,
                      }))
                    }
                    disabled={updateSettings.isPending}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">熔断开路后等待多久进入半开状态</p>
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
            <Button
              variant="outline"
              onClick={() => exportConfig.mutate()}
              disabled={exportConfig.isPending}
            >
              {exportConfig.isPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              导出配置
            </Button>

            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importConfig.isPending}
            >
              {importConfig.isPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              导入配置
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>

          {importResult && (
            <div className="rounded-lg border p-4 space-y-2 text-sm">
              <p className="font-medium">导入结果</p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-muted-foreground">
                {(
                  [
                    ['供应商', 'providers'],
                    ['模型组', 'modelGroups'],
                    ['模型实例', 'modelInstances'],
                    ['虚拟模型', 'virtualModels'],
                    ['路由规则', 'modelRoutes'],
                    ['虚拟密钥', 'virtualKeys'],
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
                      {importResult.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
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
