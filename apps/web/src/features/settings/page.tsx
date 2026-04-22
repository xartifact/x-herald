'use client'

import { useRef, useState } from 'react'

import { AlertTriangle, Bot, Download, RefreshCw, Upload } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'

import type { ImportResult } from '../config-io/types'
import { useExportConfig, useImportConfig } from '../config-io/useConfigIO'
import { useSettings, useUpdateSettings } from './useSettings'

const NONE_VALUE = '__none__'

export default function SettingsPage() {
  const exportConfig = useExportConfig()
  const importConfig = useImportConfig()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const { data: settings, isLoading: settingsLoading } = useSettings()
  const updateSettings = useUpdateSettings()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null | undefined>(undefined)

  // 未做过本地修改时显示已保存的值，否则显示用户选择
  const currentGroupId =
    selectedGroupId === undefined
      ? (settings?.defaultAnalysisModelGroupId ?? null)
      : selectedGroupId

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await importConfig.mutateAsync(file)
    setImportResult(result)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSaveDefaultModel = () => {
    updateSettings.mutate(
      { defaultAnalysisModelGroupId: currentGroupId ?? null },
      {
        onSuccess: () => {
          setSelectedGroupId(undefined)
        },
      }
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
            <CardTitle>应用默认模型</CardTitle>
          </div>
          <CardDescription>
            选择系统内部 AI 调用（如日志消息分析）使用的默认模型实例。未配置时自动选择第一个可用实例。
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
