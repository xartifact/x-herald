'use client'

import { Eye, EyeOff } from 'lucide-react'
import { UseFormReturn } from 'react-hook-form'
import { Button } from '@/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/ui/form'
import { Input } from '@/ui/input'
import { Switch } from '@/ui/switch'
import { Checkbox } from '@/ui/checkbox'
import type { ProtocolsConfig } from '../types'

interface ProtocolOption {
  value: string
  label: string
  defaultUrl: string
}

interface ProviderFormData {
  name: string
  apiKey?: string
  enabled: boolean
  protocols: {
    openai?: { enabled: boolean; baseUrl?: string }
    anthropic?: { enabled: boolean; baseUrl?: string }
    gemini?: { enabled: boolean; baseUrl?: string }
  }
}

interface ProviderFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<ProviderFormData>
  editingId: string | null
  isPending: boolean
  showApiKey: boolean
  onToggleShowApiKey: () => void
  onSubmit: (data: ProviderFormData) => void
  protocolOptions: readonly ProtocolOption[]
}

export function ProviderFormDialog({
  open,
  onOpenChange,
  form,
  editingId,
  isPending,
  showApiKey,
  onToggleShowApiKey,
  onSubmit,
  protocolOptions,
}: ProviderFormDialogProps) {
  const watchedProtocols = form.watch('protocols')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? '编辑供应商' : '添加供应商'}</DialogTitle>
          <DialogDescription>
            {editingId ? '修改供应商配置信息' : '配置新的 LLM 供应商'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        <Input
                          type={showApiKey ? 'text' : 'password'}
                          placeholder="sk-..."
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={onToggleShowApiKey}
                      >
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

            <div className="space-y-4 pt-4 border-t">
              <div>
                <h4 className="text-sm font-medium">支持的协议 *</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  选择供应商支持的协议并配置对应的 API 地址
                </p>
              </div>

              {protocolOptions.map((protocol) => {
                const config = watchedProtocols?.[protocol.value as 'openai' | 'anthropic' | 'gemini']
                return (
                  <div key={protocol.value} className="border rounded-lg p-4 space-y-3">
                    <FormField
                      control={form.control}
                      name={`protocols.${protocol.value}.enabled` as 'protocols.openai.enabled' | 'protocols.anthropic.enabled' | 'protocols.gemini.enabled'}
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
                        name={`protocols.${protocol.value}.baseUrl` as 'protocols.openai.baseUrl' | 'protocols.anthropic.baseUrl' | 'protocols.gemini.baseUrl'}
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
                  </div>
                )
              })}

              {form.formState.errors.protocols && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.protocols.message as string}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? '保存中...' : editingId ? '保存更改' : '创建'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
