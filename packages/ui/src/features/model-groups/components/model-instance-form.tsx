import { useState } from 'react'
import { UseFormReturn } from 'react-hook-form'

import type { ModelGroup, Provider } from '@xartifact/x-herald-shared'
import { Button } from '../../../shared/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../../../shared/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '../../../shared/components/ui/form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../shared/components/ui/tabs'

// Record<string, any> defined locally // TODO(6): from apps/web
import { InstanceBasicFields } from './instance-basic-fields'
import { InstanceCostFields } from './instance-cost-fields'
import { InstanceCapabilitiesFields } from './instance-capabilities-fields'
import { InstanceConfigEditor } from './instance-config-editor'

interface ModelInstanceFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<Record<string, any>>
  editingId: string | null
  isPending: boolean
  providers: Provider[]
  groups?: ModelGroup[]
  onSubmit: (data: Record<string, any>) => void
}

export function ModelInstanceForm({
  open,
  onOpenChange,
  form,
  editingId,
  isPending,
  providers,
  groups,
  onSubmit,
}: ModelInstanceFormProps) {
  const [tab, setTab] = useState('basic')
  const isDirty = form.formState.isDirty
  const requestClose = (next: boolean) => {
    if (isPending) return
    if (!next && isDirty && !window.confirm('有尚未保存的修改，确定放弃吗？')) return
    onOpenChange(next)
  }

  return (
    <Sheet open={open} onOpenChange={requestClose}>
      <SheetContent className="management-sheet">
        <SheetHeader className="management-sheet-header">
          <SheetTitle>{editingId ? '编辑模型实例' : '添加模型实例'}</SheetTitle>
          <SheetDescription>
            {editingId ? '修改模型实例配置' : '配置供应商模型实例，可在模型组页面进行分组'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, (errors) =>
              setTab(
                errors.providerId || errors.name || errors.actualModelName || errors.weight
                  ? 'basic'
                  : errors.costPer1kTokens
                    ? 'cost-cap'
                    : 'advanced',
              ),
            )}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="management-sheet-body">
              {editingId && (
                <p className="management-notice mb-4">
                  实例配置在所有关联模型组中共享。修改供应商、模型或能力将同时影响这些模型组。
                </p>
              )}
              <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">基本信息</TabsTrigger>
                  <TabsTrigger value="cost-cap">计费与能力</TabsTrigger>
                  <TabsTrigger value="advanced">高级配置</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  <InstanceBasicFields form={form} providers={providers} groups={groups} />
                </TabsContent>

                <TabsContent value="cost-cap" className="space-y-4">
                  <InstanceCostFields form={form} />
                  <InstanceCapabilitiesFields form={form} />
                </TabsContent>

                <TabsContent value="advanced" className="space-y-4">
                  <FormField
                    control={form.control}
                    name="config"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <InstanceConfigEditor value={field.value} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>
            </div>
            <SheetFooter className="management-sheet-footer">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => requestClose(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? '保存中...' : editingId ? '保存更改' : '创建'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
