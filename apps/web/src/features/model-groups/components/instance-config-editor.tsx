'use client'

import { useState } from 'react'

import { Plus, Trash2, AlertCircle } from 'lucide-react'

import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Switch } from '@/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'
import { Textarea } from '@/ui/textarea'

import type { InstanceFormData } from '../form-types'

interface InstanceConfigEditorProps {
  value: InstanceFormData['config']
  onChange: (config: InstanceFormData['config']) => void
}

export function InstanceConfigEditor({ value, onChange }: InstanceConfigEditorProps) {
  const [activeTab, setActiveTab] = useState('transforms')
  const [jsonError, setJsonError] = useState<string | null>(null)

  const config = value || {}

  // Parameter Transforms
  const addTransform = () => {
    const newTransform = {
      when: {
        paramName: '',
        operator: 'exists' as const,
      },
      action: {
        type: 'add' as const,
        targetParam: '',
      },
    }
    onChange({
      ...config,
      parameterTransforms: [...(config.parameterTransforms || []), newTransform],
    })
  }

  const updateTransform = (index: number, transform: NonNullable<typeof config.parameterTransforms>[0]) => {
    const newTransforms = [...(config.parameterTransforms || [])]
    newTransforms[index] = transform
    onChange({ ...config, parameterTransforms: newTransforms })
  }

  const removeTransform = (index: number) => {
    const newTransforms = [...(config.parameterTransforms || [])]
    newTransforms.splice(index, 1)
    onChange({ ...config, parameterTransforms: newTransforms })
  }

  // Custom Headers
  const addHeader = () => {
    onChange({
      ...config,
      customHeaders: {
        ...(config.customHeaders || {}),
        '': '',
      },
    })
  }

  const updateHeader = (oldKey: string, newKey: string, headerValue: string) => {
    const newHeaders = { ...(config.customHeaders || {}) }
    if (oldKey !== newKey) {
      delete newHeaders[oldKey]
    }
    newHeaders[newKey] = headerValue
    onChange({ ...config, customHeaders: newHeaders })
  }

  const removeHeader = (key: string) => {
    const newHeaders = { ...(config.customHeaders || {}) }
    delete newHeaders[key]
    onChange({ ...config, customHeaders: newHeaders })
  }

  // Schema Config
  const updateSchemaConfig = (updates: Partial<typeof config.schemaConfig>) => {
    onChange({
      ...config,
      schemaConfig: {
        ...config.schemaConfig,
        cleanEnabled: config.schemaConfig?.cleanEnabled ?? true,
        ...updates,
      },
    })
  }

  // JSON Editor
  const handleJsonChange = (json: string) => {
    try {
      const parsed = JSON.parse(json)
      setJsonError(null)
      onChange(parsed)
    } catch (e) {
      setJsonError((e as Error).message)
    }
  }

  const formatJson = () => {
    return JSON.stringify(config, null, 2)
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="transforms">参数转换</TabsTrigger>
        <TabsTrigger value="schema">Schema 配置</TabsTrigger>
        <TabsTrigger value="headers">自定义 Headers</TabsTrigger>
        <TabsTrigger value="json">JSON 编辑</TabsTrigger>
      </TabsList>

      {/* Parameter Transforms */}
      <TabsContent value="transforms" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">参数转换规则</h4>
            <p className="text-xs text-muted-foreground">
              定义请求参数的转换规则，支持条件判断
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addTransform}>
            <Plus className="h-4 w-4 mr-1" />
            添加规则
          </Button>
        </div>

        {(config.parameterTransforms || []).length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
            暂无转换规则，点击上方按钮添加
          </div>
        )}

        {(config.parameterTransforms || []).map((transform, index) => (
          <Card key={index} className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 h-8 w-8 p-0"
              onClick={() => removeTransform(index)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">规则 {index + 1}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* When Condition */}
              <div className="space-y-2">
                <Label className="text-xs">匹配条件 (When)</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="参数名"
                    value={transform.when?.paramName || ''}
                    onChange={(e) =>
                      updateTransform(index, {
                        ...transform,
                        when: { ...transform.when, paramName: e.target.value, operator: transform.when?.operator || 'exists' },
                      })
                    }
                    className="h-8 text-xs"
                  />
                  <select
                    value={transform.when?.operator || 'exists'}
                    onChange={(e) =>
                      updateTransform(index, {
                        ...transform,
                        when: {
                          paramName: transform.when?.paramName || '',
                          operator: e.target.value as NonNullable<typeof transform.when>['operator'],
                          value: transform.when?.value,
                        },
                      })
                    }
                    className="h-8 text-xs rounded-md border border-input bg-background px-2"
                  >
                    <option value="eq">等于 (eq)</option>
                    <option value="ne">不等于 (ne)</option>
                    <option value="exists">存在 (exists)</option>
                    <option value="not_exists">不存在 (not_exists)</option>
                  </select>
                  <Input
                    placeholder="值（可选）"
                    value={JSON.stringify(transform.when?.value) || ''}
                    onChange={(e) => {
                      try {
                        const val = e.target.value ? JSON.parse(e.target.value) : undefined
                        updateTransform(index, {
                          ...transform,
                          when: { paramName: transform.when?.paramName || '', operator: transform.when?.operator || 'exists', value: val },
                        })
                      } catch {
                        updateTransform(index, {
                          ...transform,
                          when: { paramName: transform.when?.paramName || '', operator: transform.when?.operator || 'exists', value: e.target.value },
                        })
                      }
                    }}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Action */}
              <div className="space-y-2">
                <Label className="text-xs">操作 (Action)</Label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={transform.action?.type || 'add'}
                    onChange={(e) =>
                      updateTransform(index, {
                        ...transform,
                        action: {
                          ...transform.action,
                          type: e.target.value as typeof transform.action.type,
                        },
                      })
                    }
                    className="h-8 text-xs rounded-md border border-input bg-background px-2"
                  >
                    <option value="add">添加 (add)</option>
                    <option value="remove">移除 (remove)</option>
                    <option value="rename">重命名 (rename)</option>
                    <option value="transform">转换 (transform)</option>
                  </select>
                  <Input
                    placeholder="目标参数"
                    value={transform.action?.targetParam || ''}
                    onChange={(e) =>
                      updateTransform(index, {
                        ...transform,
                        action: { ...transform.action, targetParam: e.target.value },
                      })
                    }
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="值或表达式"
                    value={transform.action?.value !== undefined ? String(transform.action.value) : ''}
                    onChange={(e) =>
                      updateTransform(index, {
                        ...transform,
                        action: { ...transform.action, value: e.target.value },
                      })
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="text-xs text-muted-foreground">
          <p>支持的表达式格式：</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li><code>{'${reasoning.enabled} ? true : false'}</code> - 三元表达式</li>
            <li><code>{'${temperature}'}</code> - 引用请求参数</li>
          </ul>
        </div>
      </TabsContent>

      {/* Schema Config */}
      <TabsContent value="schema" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Schema 清理配置</CardTitle>
            <CardDescription>
              配置工具函数参数的 schema 清理规则
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">启用清理</Label>
                <p className="text-xs text-muted-foreground">
                  自动移除不兼容 OpenAI 的元数据字段
                </p>
              </div>
              <Switch
                checked={config.schemaConfig?.cleanEnabled ?? true}
                onCheckedChange={(checked) =>
                  updateSchemaConfig({ cleanEnabled: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">保留字段（可选）</Label>
              <Textarea
                placeholder="输入要保留的字段，每行一个&#10;例如：$schema&#10;definitions"
                value={(config.schemaConfig?.preserveFields || []).join('\n')}
                onChange={(e) =>
                  updateSchemaConfig({
                    preserveFields: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="min-h-[80px] text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">额外清理字段（可选）</Label>
              <Textarea
                placeholder="输入要额外清理的字段，每行一个&#10;例如：customField&#10;deprecated"
                value={(config.schemaConfig?.additionalBannedFields || []).join('\n')}
                onChange={(e) =>
                  updateSchemaConfig({
                    additionalBannedFields: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="min-h-[80px] text-xs"
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Custom Headers */}
      <TabsContent value="headers" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">自定义 HTTP Headers</h4>
            <p className="text-xs text-muted-foreground">
              添加到 Provider 请求的自定义 Headers
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addHeader}>
            <Plus className="h-4 w-4 mr-1" />
            添加 Header
          </Button>
        </div>

        {Object.keys(config.customHeaders || {}).length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
            暂无自定义 Headers，点击上方按钮添加
          </div>
        )}

        {Object.entries(config.customHeaders || {}).map(([key, headerValue], index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder="Header 名称"
              value={key}
              onChange={(e) => updateHeader(key, e.target.value, headerValue)}
              className="flex-1 h-8 text-xs"
            />
            <Input
              placeholder="Header 值"
              value={headerValue}
              onChange={(e) => updateHeader(key, key, e.target.value)}
              className="flex-1 h-8 text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => removeHeader(key)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}

        <div className="text-xs text-muted-foreground">
          <p>变量支持：</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li><code>{'${requestId}'}</code> - 当前请求 ID</li>
          </ul>
        </div>
      </TabsContent>

      {/* JSON Editor */}
      <TabsContent value="json" className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">原始 JSON 配置</Label>
            {jsonError && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                格式错误
              </Badge>
            )}
          </div>
          <Textarea
            value={formatJson()}
            onChange={(e) => handleJsonChange(e.target.value)}
            className="min-h-[300px] font-mono text-xs"
          />
          {jsonError && (
            <p className="text-xs text-destructive">{jsonError}</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
