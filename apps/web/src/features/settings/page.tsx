'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Settings, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Switch } from '@/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/ui/form'
import { Alert, AlertDescription, AlertTitle } from '@/ui/alert'
import { useSettings, useUpdateSettings } from './useSettings'

const settingsFormSchema = z.object({
  modelMapping: z.object({
    enabled: z.boolean(),
    defaultModelGroup: z.string(),
  }),
})

type SettingsFormValues = z.infer<typeof settingsFormSchema>

export default function SettingsPage() {
  const { data: settings, isLoading, error } = useSettings()
  const updateSettings = useUpdateSettings()

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      modelMapping: {
        enabled: true,
        defaultModelGroup: '',
      },
    },
  })

  // 当数据加载完成后更新表单值
  useEffect(() => {
    if (settings) {
      form.reset({
        modelMapping: {
          enabled: settings.modelMapping.enabled,
          defaultModelGroup: settings.modelMapping.defaultModelGroup,
        },
      })
    }
  }, [settings, form])

  const onSubmit = async (data: SettingsFormValues) => {
    await updateSettings.mutateAsync(data)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    )
  }

  const showDefaultGroupWarning =
    settings?.modelMapping.defaultModelGroup &&
    !settings?.modelMapping.defaultGroupExists

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">系统设置</h2>
        <p className="text-muted-foreground">
          管理网关全局配置，修改后立即生效
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                <CardTitle>模型映射配置</CardTitle>
              </div>
              <CardDescription>
                配置模型映射功能，当请求的模型不存在时自动映射到默认模型组
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 启用模型映射 */}
              <FormField
                control={form.control}
                name="modelMapping.enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        启用模型映射
                      </FormLabel>
                      <FormDescription>
                        开启后，当客户端请求的模型不存在时，会自动映射到默认模型组
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* 默认模型组选择 */}
              {form.watch('modelMapping.enabled') && (
                <FormField
                  control={form.control}
                  name="modelMapping.defaultModelGroup"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>默认模型组</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="选择默认模型组" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {settings?.availableModelGroups.map((group) => (
                            <SelectItem key={group.id} value={group.name}>
                              {group.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        当请求的模型不存在时，将自动映射到该模型组
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* 警告提示 */}
              {showDefaultGroupWarning && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>配置警告</AlertTitle>
                  <AlertDescription>
                    当前配置的默认模型组 &quot;{settings?.modelMapping.defaultModelGroup}&quot;
                    不存在或已被禁用，请重新选择。
                  </AlertDescription>
                </Alert>
              )}

              {/* 状态提示 */}
              {settings?.modelMapping.defaultGroupExists && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>配置有效</AlertTitle>
                  <AlertDescription>
                    默认模型组 &quot;{settings?.modelMapping.defaultModelGroup}&quot; 已验证通过
                  </AlertDescription>
                </Alert>
              )}

              {/* 保存按钮 */}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={updateSettings.isPending || !form.formState.isDirty}
                >
                  {updateSettings.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    '保存设置'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  )
}
