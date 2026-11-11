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

type ProtocolKey = 'openai' | 'anthropic' | 'gemini' | 'jev' | 'asr' | 'tts'

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
        const endpointField = `protocols.${key}.endpoint` as `protocols.${ProtocolKey}.endpoint`
        // 音频协议（asr/tts）用自有端点路径；其余协议走固定协议端点，不展示该输入
        const supportsEndpoint = protocol.defaultEndpoint !== undefined
        // 音频协议没有公共默认地址：给一个形状提示，避免空白输入框无从下手
        const baseUrlPlaceholder =
          protocol.defaultUrl || (supportsEndpoint ? 'http://x99:8080' : '')

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
                        placeholder={baseUrlPlaceholder}
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
            {config?.enabled && supportsEndpoint && (
              <FormField
                control={form.control}
                name={endpointField}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>上游端点</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={protocol.defaultEndpoint}
                        value={(field.value as string) || ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </FormControl>
                    <p className="text-sm text-muted-foreground">
                      上游自有契约的路径（如 whisper-server 的 /inference）；留空使用默认值
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {config?.enabled && !supportsEndpoint && (
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
