import { UseFormReturn } from 'react-hook-form'

import { FormControl, FormField, FormItem, FormLabel } from '../ui/form'
import { Switch } from '../ui/switch'

// Record<string, any> defined locally // TODO(6): from apps/web

interface CapabilitiesFieldsProps {
  form: UseFormReturn<Record<string, any>>
}

const CAPABILITY_FIELDS = [
  { name: 'capabilities.streaming' as const, label: '流式输出' },
  { name: 'capabilities.functionCalling' as const, label: '函数调用' },
  { name: 'capabilities.vision' as const, label: '视觉能力' },
  { name: 'capabilities.jsonMode' as const, label: 'JSON 模式' },
]

export function CapabilitiesFields({ form }: CapabilitiesFieldsProps) {
  return (
    <div className="space-y-4 pt-4 border-t">
      <h4 className="text-sm font-medium">能力配置</h4>
      <div className="grid grid-cols-2 gap-4">
        {CAPABILITY_FIELDS.map(({ name, label }) => (
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
    </div>
  )
}
