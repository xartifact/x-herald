import { useSettings } from '../../../hooks/settings'
import {
  AiModelSection,
  CircuitBreakerSection,
  ConfigIOSection,
  TtfbTimeoutSection,
  Card,
  CardContent,
  Alert,
  AlertTitle,
  AlertDescription,
  PageHeader,
} from '@xartifact/x-llm-gateway-ui'
import { AlertCircle, Loader2 } from 'lucide-react'

export function SettingsPage() {
  const { data: settings, isLoading, error } = useSettings()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="系统设置" description="管理全局配置、熔断器与 TTFB 超时" />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="系统设置" description="管理全局配置、熔断器与 TTFB 超时" />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{error instanceof Error ? error.message : '未知错误'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="系统设置" description="管理全局配置、熔断器与 TTFB 超时" />

      <AiModelSection settings={settings} isLoading={isLoading} />
      <TtfbTimeoutSection settings={settings} isLoading={isLoading} />
      <CircuitBreakerSection settings={settings} isLoading={isLoading} />
      <ConfigIOSection />
    </div>
  )
}
