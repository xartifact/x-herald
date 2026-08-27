import { UseFormReturn } from 'react-hook-form'

import type { ModelGroup, Provider } from '@xartifact/x-herald-shared'
import { Checkbox } from '../../../shared/components/ui/checkbox'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../shared/components/ui/form'
import { Input } from '../../../shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/components/ui/select'

// Record<string, any> defined locally // TODO(6): from apps/web

interface InstanceBasicFieldsProps {
  form: UseFormReturn<Record<string, any>>
  providers: Provider[]
  groups?: ModelGroup[]
}

export function InstanceBasicFields({ form, providers, groups = [] }: InstanceBasicFieldsProps) {
  const selected = (form.watch('groupIds') ?? []) as string[]
  const toggleGroup = (groupId: string) => {
    const next = selected.includes(groupId)
      ? selected.filter((g) => g !== groupId)
      : [...selected, groupId]
    form.setValue('groupIds', next, { shouldDirty: true })
  }

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
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
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
                <Input
                  type="number"
                  min={0}
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                />
              </FormControl>
              <FormDescription>用于加权路由</FormDescription>
            </FormItem>
          )}
        />
      </div>

      {groups.length > 0 && (
        <FormField
          control={form.control}
          name="groupIds"
          render={() => (
            <FormItem>
              <FormLabel>加入的模型组</FormLabel>
              <div className="space-y-2 border rounded-lg p-3">
                {groups.map((group) => (
                  <label key={group.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={selected.includes(group.id)}
                      onCheckedChange={() => toggleGroup(group.id)}
                    />
                    <span>{group.displayName || group.name}</span>
                  </label>
                ))}
              </div>
              <FormDescription>一个实例可加入多个模型组</FormDescription>
            </FormItem>
          )}
        />
      )}
    </div>
  )
}
