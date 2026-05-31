'use client'

import { AiModelSection, CircuitBreakerSection, ConfigIOSection, useSettings } from '@x-llm-gateway/ui'

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">系统设置</h2>
        <p className="text-muted-foreground">管理网关全局配置</p>
      </div>

      <AiModelSection settings={settings} isLoading={isLoading} />
      <CircuitBreakerSection settings={settings} isLoading={isLoading} />
      <ConfigIOSection />
    </div>
  )
}
