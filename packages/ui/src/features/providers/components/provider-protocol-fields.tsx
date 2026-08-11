import { UseFormReturn } from 'react-hook-form'

import { Checkbox } from '../../../shared/components/ui/checkbox'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../shared/components/ui/form'
import { Input } from '../../../shared/components/ui/input'
import { Switch } from '../../../shared/components/ui/switch'

import type { ProtocolOption, ProviderFormData } from './provider-form-types'

type ProtocolKey = 'openai' | 'anthropic' | 'gemini'

interface ProviderProtocolFieldsProps {
  form: UseFormReturn<ProviderFormData>
  protocolOptions: readonly ProtocolOption[]
}

export function ProviderProtocolFields({ form, protocolOptions }: ProviderProtocolFieldsProps) {
  const watchedProtocols = form.watch('protocols')

  return (
    <div className="space-y-4 pt-4 border-t">
      <div>
        <h4 className="text-sm font-medium">支持的协议 *</h4>
        <p className="text-sm text-muted-foreground mt-1">
          选择供应商支持的协议并配置对应的 API 地址
        </p>
      </div>

      {protocolOptions.map((protocol) => {
        const key = protocol.value as ProtocolKey
        const config = watchedProtocols?.[key]
        const enabledField = `protocols.${key}.enabled` as `protocols.${ProtocolKey}.enabled`
        const baseUrlField = `protocols.${key}.baseUrl` as `protocols.${ProtocolKey}.baseUrl`
        const toolSchemaSanitizationField =
          `protocols.${key}.toolSchemaSanitization` as `protocols.${ProtocolKey}.toolSchemaSanitization`

        return (
          <div key={protocol.value} className="border rounded-lg p-4 space-y-3">
            <FormField
              control={form.control}
              name={enabledField}
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="font-medium">{protocol.label}</FormLabel>
                  </div>
                </FormItem>
              )}
            />
            {config?.enabled && (
              <FormField
                control={form.control}
                name={baseUrlField}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API 地址</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={protocol.defaultUrl}
                        value={field.value || ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {config?.enabled && (
              <FormField
                control={form.control}
                name={toolSchemaSanitizationField}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel className="font-normal">Tool Schema 归一化</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        自动修正不规范的 tool 参数 schema（如 required 非数组、anyOf/oneOf 分支缺失
                        type），避免被严格校验的 Provider 以 400 拒绝
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </div>
        )
      })}

      {form.formState.errors.protocols?.message && (
        <p className="text-sm text-destructive">{form.formState.errors.protocols.message}</p>
      )}
    </div>
  )
}
