'use client'

import { UseFormReturn } from 'react-hook-form'

import type { Provider } from '@x-llm-gateway/shared'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Form, FormControl, FormField, FormItem, FormMessage } from '../ui/form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'

import type { InstanceFormData } from '../form-types' // TODO(6): from apps/web
import { InstanceBasicFields } from './instance-basic-fields'
import { InstanceConfigEditor } from './instance-config-editor'

interface ModelInstanceFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<InstanceFormData>
  editingId: string | null
  isPending: boolean
  providers: Provider[]
  onSubmit: (data: InstanceFormData) => void
}

export function ModelInstanceForm({ open, onOpenChange, form, editingId, isPending, providers, onSubmit }: ModelInstanceFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? '编辑模型实例' : '添加模型实例'}</DialogTitle>
          <DialogDescription>
            {editingId ? '修改模型实例配置' : '配置供应商模型实例，可在模型组页面进行分组'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic">基本信息</TabsTrigger>
                <TabsTrigger value="advanced">高级配置</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                <InstanceBasicFields form={form} providers={providers} />
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

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
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
