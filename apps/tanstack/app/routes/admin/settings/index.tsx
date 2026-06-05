import {
  useSettings,
  AiModelSection,
  CircuitBreakerSection,
  ConfigIOSection,
  Card, CardContent,
  Alert, AlertTitle, AlertDescription,
} from '@x-llm-gateway/ui'
import { AlertCircle } from 'lucide-react'

export function SettingsPage() {
  const { data: settings, isLoading, error } = useSettings()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">系统设置</h1>
          <p className="text-muted-foreground">管理全局配置与熔断器参数</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground text-center">加载中...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">系统设置</h1>
          <p className="text-muted-foreground">管理全局配置与熔断器参数</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : '未知错误'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">系统设置</h1>
        <p className="text-muted-foreground">管理全局配置与熔断器参数</p>
      </div>

      <AiModelSection settings={settings} isLoading={isLoading} />
      <CircuitBreakerSection settings={settings} isLoading={isLoading} />
      <ConfigIOSection />
    </div>
  )
}
