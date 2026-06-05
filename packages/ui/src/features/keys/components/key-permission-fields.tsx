import { UseFormReturn } from 'react-hook-form'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../shared/components/ui/form'
import { Input } from '../../../shared/components/ui/input'

import type { KeyFormData } from './key-form-types'

interface KeyPermissionFieldsProps {
  form: UseFormReturn<KeyFormData>
}

export function KeyPermissionFields({ form }: KeyPermissionFieldsProps) {
  return (
    <div className="space-y-4 pt-4 border-t">
      <h4 className="text-sm font-medium">访问限制</h4>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="rateLimitRpm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>每分钟请求数 (RPM)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="无限制"
                  {...field}
                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="rateLimitRpd"
          render={({ field }) => (
            <FormItem>
              <FormLabel>每天请求数 (RPD)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="无限制"
                  {...field}
                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="tokenLimitDaily"
        render={({ field }) => (
          <FormItem>
            <FormLabel>每日 Token 限制</FormLabel>
            <FormControl>
              <Input
                type="number"
                placeholder="无限制"
                {...field}
                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                value={field.value ?? ''}
              />
            </FormControl>
            <FormDescription>每天最多消耗的 token 数量</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="expiresAt"
        render={({ field }) => (
          <FormItem>
            <FormLabel>过期时间</FormLabel>
            <FormControl>
              <Input type="date" {...field} />
            </FormControl>
            <FormDescription>留空表示永不过期</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="allowedModels"
        render={({ field }) => (
          <FormItem>
            <FormLabel>允许的模型</FormLabel>
            <FormControl>
              <Input placeholder="gpt-4, gpt-3.5-turbo, claude-3-opus" {...field} />
            </FormControl>
            <FormDescription>用逗号分隔模型名称，留空表示允许访问所有模型</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
