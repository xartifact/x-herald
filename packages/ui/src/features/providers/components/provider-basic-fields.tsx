import { Eye, EyeOff } from 'lucide-react'
import { UseFormReturn } from 'react-hook-form'

import { Button } from '../../../shared/components/ui/button'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../shared/components/ui/form'
import { Input } from '../../../shared/components/ui/input'
import { Switch } from '../../../shared/components/ui/switch'

import type { ProviderFormData } from './provider-form-types'

interface ProviderBasicFieldsProps {
  form: UseFormReturn<ProviderFormData>
  showApiKey: boolean
  onToggleShowApiKey: () => void
}

export function ProviderBasicFields({
  form,
  showApiKey,
  onToggleShowApiKey,
}: ProviderBasicFieldsProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">基本信息</h4>

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>供应商名称 *</FormLabel>
            <FormControl>
              <Input placeholder="X-AIO API" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="apiKey"
        render={({ field }) => (
          <FormItem>
            <FormLabel>API 密钥</FormLabel>
            <div className="flex gap-2">
              <FormControl>
                <Input type={showApiKey ? 'text' : 'password'} placeholder="sk-..." {...field} />
              </FormControl>
              <Button type="button" variant="outline" size="icon" onClick={onToggleShowApiKey}>
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <FormDescription>供应商的 API 密钥（加密存储，所有协议共享）</FormDescription>
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
              <FormLabel>启用供应商</FormLabel>
              <FormDescription>禁用后此供应商将不会被路由使用</FormDescription>
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
