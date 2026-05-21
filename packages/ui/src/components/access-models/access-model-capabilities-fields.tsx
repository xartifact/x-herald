import type { UseFormReturn } from 'react-hook-form'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '../ui/form'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'

import type { AccessModelFormData } from '@x-llm-gateway/shared'

interface AccessModelCapabilitiesFieldsProps {
  form: UseFormReturn<AccessModelFormData>
}

const SWITCH_CAPABILITIES = [
  { name: 'capabilities.streaming' as const, label: '流式输出' },
  { name: 'capabilities.functionCalling' as const, label: '函数调用' },
  { name: 'capabilities.vision' as const, label: '视觉能力' },
  { name: 'capabilities.jsonMode' as const, label: 'JSON 模式' },
  { name: 'capabilities.reasoning' as const, label: '推理能力' },
]

export function AccessModelCapabilitiesFields({ form }: AccessModelCapabilitiesFieldsProps) {
  return (
    <div className="space-y-4 pt-4 border-t">
      <h4 className="text-sm font-medium">能力配置</h4>
      <p className="text-xs text-muted-foreground">用于 /v1/models 接口返回，客户端可据此判断模型支持的功能</p>
      <div className="grid grid-cols-2 gap-3">
        {SWITCH_CAPABILITIES.map(({ name, label }) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3">
                <FormLabel className="mb-0">{label}</FormLabel>
                <FormControl>
                  <Switch checked={field.value as boolean} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="capabilities.contextWindow"
          render={({ field }) => (
            <FormItem>
              <FormLabel>上下文窗口 (tokens)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  placeholder="131072"
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                />
              </FormControl>
              <FormDescription>0 表示不限制</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="capabilities.maxTokens"
          render={({ field }) => (
            <FormItem>
              <FormLabel>最大输出 (tokens)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  placeholder="4096"
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                />
              </FormControl>
              <FormDescription>0 表示不限制</FormDescription>
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}
