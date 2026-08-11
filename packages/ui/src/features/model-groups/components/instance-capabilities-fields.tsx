import { UseFormReturn } from 'react-hook-form'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '../../../shared/components/ui/form'
import { Input } from '../../../shared/components/ui/input'
import { Switch } from '../../../shared/components/ui/switch'

interface InstanceCapabilitiesFieldsProps {
  form: UseFormReturn<Record<string, unknown>>
}

/**
 * 模型实例能力覆盖（instance.config.capabilityOverrides）。
 *
 * 优先级链（代理请求时）：
 *   instance.config.capabilityOverrides > group.capabilities > accessModel.capabilities
 *
 * 注意：实例级覆盖只影响代理请求行为（如过滤不支持的参数），
 * 不影响 /v1/models 端点展示的 capabilities（那是 AM/Group 级）。
 */
export function InstanceCapabilitiesFields({ form }: InstanceCapabilitiesFieldsProps) {
  return (
    <div className="space-y-4 pt-4 border-t">
      <div>
        <h4 className="text-sm font-medium">能力覆盖</h4>
        <p className="text-xs text-muted-foreground">
          覆盖模型组的默认能力配置，仅在代理请求时生效
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="config.capabilityOverrides.streaming"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <FormLabel className="mb-0">流式输出</FormLabel>
              <FormControl>
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="config.capabilityOverrides.functionCalling"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <FormLabel className="mb-0">函数调用</FormLabel>
              <FormControl>
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="config.capabilityOverrides.vision"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <FormLabel className="mb-0">视觉能力</FormLabel>
              <FormControl>
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="config.capabilityOverrides.jsonMode"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <FormLabel className="mb-0">JSON 模式</FormLabel>
              <FormControl>
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="config.capabilityOverrides.maxTokens"
          render={({ field }) => (
            <FormItem>
              <FormLabel>最大输出 Tokens</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  placeholder="4096"
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === '' ? undefined : parseInt(e.target.value) || undefined,
                    )
                  }
                />
              </FormControl>
              <FormDescription>覆盖组级默认值</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="config.capabilityOverrides.contextWindow"
          render={({ field }) => (
            <FormItem>
              <FormLabel>上下文窗口</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  placeholder="128000"
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === '' ? undefined : parseInt(e.target.value) || undefined,
                    )
                  }
                />
              </FormControl>
              <FormDescription>覆盖组级默认值</FormDescription>
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}
