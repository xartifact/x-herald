import { UseFormReturn } from 'react-hook-form'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'

import type { KeyFormData } from './key-form-types'

interface KeyBasicFieldsProps {
  form: UseFormReturn<KeyFormData>
}

export function KeyBasicFields({ form }: KeyBasicFieldsProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">基本信息</h4>

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>密钥名称 *</FormLabel>
            <FormControl>
              <Input placeholder="生产环境密钥" {...field} />
            </FormControl>
            <FormDescription>给密钥起一个有意义的名称，便于识别用途</FormDescription>
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
              <FormLabel>启用密钥</FormLabel>
              <FormDescription>禁用后此密钥将无法访问 API</FormDescription>
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
