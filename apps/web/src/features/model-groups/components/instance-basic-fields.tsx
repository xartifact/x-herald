import { UseFormReturn } from 'react-hook-form'

import type { Provider } from '@x-llm-gateway/engine'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@x-llm-gateway/ui'
import { Input } from '@x-llm-gateway/ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@x-llm-gateway/ui'

import type { InstanceFormData } from '../form-types'

interface InstanceBasicFieldsProps {
  form: UseFormReturn<InstanceFormData>
  providers: Provider[]
}

export function InstanceBasicFields({ form, providers }: InstanceBasicFieldsProps) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="providerId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>供应商 *</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="选择供应商" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>实例名称 *</FormLabel>
              <FormControl>
                <Input placeholder="OpenAI GPT-4" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="actualModelName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>实际模型名称 *</FormLabel>
              <FormControl>
                <Input placeholder="gpt-4-turbo-preview" {...field} />
              </FormControl>
              <FormDescription>供应商 API 中的模型名称</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="weight"
          render={({ field }) => (
            <FormItem>
              <FormLabel>权重</FormLabel>
              <FormControl>
                <Input type="number" min={0} {...field} onChange={(e) => field.onChange(parseInt(e.target.value))} />
              </FormControl>
              <FormDescription>用于加权路由</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>优先级</FormLabel>
              <FormControl>
                <Input type="number" min={0} {...field} onChange={(e) => field.onChange(parseInt(e.target.value))} />
              </FormControl>
              <FormDescription>数字越小优先级越高</FormDescription>
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}
