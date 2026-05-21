'use client'

import { useState } from 'react'

import { Bot, RefreshCw } from 'lucide-react'

import { Button } from '@x-llm-gateway/ui'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@x-llm-gateway/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@x-llm-gateway/ui'

import type { SettingsData } from './types'
import { useUpdateSettings } from './useSettings'

const NONE_VALUE = '__none__'

interface AiModelSectionProps {
  settings: SettingsData | undefined
  isLoading: boolean
}

export function AiModelSection({ settings, isLoading }: AiModelSectionProps) {
  const updateSettings = useUpdateSettings()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null | undefined>(undefined)

  const currentGroupId = selectedGroupId === undefined
    ? (settings?.aiModelGroupId ?? null)
    : selectedGroupId

  const handleSave = () => {
    updateSettings.mutate(
      { aiModelGroupId: currentGroupId ?? null },
      { onSuccess: () => setSelectedGroupId(undefined) }
    )
  }

  return (
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
        {isLoading ? (
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
                  <SelectItem value={NONE_VALUE} disabled>暂无模型组，请先创建</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={handleSave}
              disabled={updateSettings.isPending || selectedGroupId === undefined}
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
