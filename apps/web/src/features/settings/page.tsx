'use client'

import { useExportConfig, useImportConfig } from '../config-io/useConfigIO'
import type { ImportResult } from '../config-io/types'
import { useRef, useState } from 'react'
import { Download, Upload, RefreshCw, AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'

export default function SettingsPage() {
  const exportConfig = useExportConfig()
  const importConfig = useImportConfig()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await importConfig.mutateAsync(file)
    setImportResult(result)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">系统设置</h2>
        <p className="text-muted-foreground">
          管理网关全局配置
        </p>
      </div>

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
