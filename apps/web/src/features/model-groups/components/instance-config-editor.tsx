'use client'

import { useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'

import type { InstanceFormData } from '../form-types'
import { HeadersTab } from './headers-tab'
import { JsonEditorTab } from './json-editor-tab'
import { SchemaTab } from './schema-tab'
import { TransformsTab } from './transforms-tab'

type InstanceConfig = NonNullable<InstanceFormData['config']>
type TransformRule = NonNullable<InstanceConfig['parameterTransforms']>[0]
type SchemaConfig = NonNullable<InstanceConfig['schemaConfig']>

interface InstanceConfigEditorProps {
  value: InstanceFormData['config']
  onChange: (config: InstanceFormData['config']) => void
}

export function InstanceConfigEditor({ value, onChange }: InstanceConfigEditorProps) {
  const [activeTab, setActiveTab] = useState('transforms')
  const [jsonError, setJsonError] = useState<string | null>(null)

  const config: InstanceConfig = value || {}

  const addTransform = () => {
    const newTransform: TransformRule = { when: { paramName: '', operator: 'exists' }, action: { type: 'add', targetParam: '' } }
    onChange({ ...config, parameterTransforms: [...(config.parameterTransforms || []), newTransform] })
  }

  const updateTransform = (index: number, transform: TransformRule) => {
    const next = [...(config.parameterTransforms || [])]
    next[index] = transform
    onChange({ ...config, parameterTransforms: next })
  }

  const removeTransform = (index: number) => {
    const next = [...(config.parameterTransforms || [])]
    next.splice(index, 1)
    onChange({ ...config, parameterTransforms: next })
  }

  const addHeader = () => {
    onChange({ ...config, customHeaders: { ...(config.customHeaders || {}), '': '' } })
  }

  const updateHeader = (oldKey: string, newKey: string, headerValue: string) => {
    const next = { ...(config.customHeaders || {}) }
    if (oldKey !== newKey) delete next[oldKey]
    next[newKey] = headerValue
    onChange({ ...config, customHeaders: next })
  }

  const removeHeader = (key: string) => {
    const next = { ...(config.customHeaders || {}) }
    delete next[key]
    onChange({ ...config, customHeaders: next })
  }

  const updateSchemaConfig = (updates: Partial<SchemaConfig>) => {
    onChange({
      ...config,
      schemaConfig: { cleanEnabled: config.schemaConfig?.cleanEnabled ?? true, ...config.schemaConfig, ...updates },
    })
  }

  const handleJsonChange = (json: string) => {
    try {
      setJsonError(null)
      onChange(JSON.parse(json))
    } catch (e) {
      setJsonError((e as Error).message)
    }
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="transforms">参数转换</TabsTrigger>
        <TabsTrigger value="schema">Schema 配置</TabsTrigger>
        <TabsTrigger value="headers">自定义 Headers</TabsTrigger>
        <TabsTrigger value="json">JSON 编辑</TabsTrigger>
      </TabsList>

      <TabsContent value="transforms" className="space-y-4">
        <TransformsTab
          transforms={config.parameterTransforms || []}
          onAdd={addTransform}
          onUpdate={updateTransform}
          onRemove={removeTransform}
        />
      </TabsContent>

      <TabsContent value="schema" className="space-y-4">
        <SchemaTab schemaConfig={config.schemaConfig} onChange={updateSchemaConfig} />
      </TabsContent>

      <TabsContent value="headers" className="space-y-4">
        <HeadersTab
          headers={config.customHeaders || {}}
          onAdd={addHeader}
          onUpdate={updateHeader}
          onRemove={removeHeader}
        />
      </TabsContent>

      <TabsContent value="json" className="space-y-4">
        <JsonEditorTab
          json={JSON.stringify(config, null, 2)}
          onChange={handleJsonChange}
          error={jsonError}
        />
      </TabsContent>
    </Tabs>
  )
}
