import type { UseFormReturn } from 'react-hook-form'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@x-llm-gateway/ui'
import { Input } from '@x-llm-gateway/ui'
import { Switch } from '@x-llm-gateway/ui'

import type { AccessModelFormData } from '../useAccessModelPage'

interface AccessModelBasicFieldsProps {
  form: UseFormReturn<AccessModelFormData>
}

export function AccessModelBasicFields({ form }: AccessModelBasicFieldsProps) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="name"
        rules={{ required: '接入模型名称不能为空' }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>模型名称 *</FormLabel>
            <FormControl>
              <Input placeholder="my-gpt4" {...field} />
            </FormControl>
            <FormDescription>对外暴露的模型名称，客户端使用此名称请求</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="displayName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>显示名称</FormLabel>
            <FormControl>
              <Input placeholder="My GPT-4" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>描述</FormLabel>
            <FormControl>
              <Input placeholder="路由到 GPT-4 Turbo 的接入模型" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="enabled"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <FormLabel>启用</FormLabel>
              <FormDescription>启用后客户端可以使用此接入模型名称</FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  )
}
