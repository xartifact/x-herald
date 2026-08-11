import { useEffect } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import { Button } from '../../../shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../shared/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../shared/components/ui/form'
import { Input } from '../../../shared/components/ui/input'
import { Switch } from '../../../shared/components/ui/switch'
import { Textarea } from '../../../shared/components/ui/textarea'

import type { PotentialModel } from '@xartifact/x-llm-gateway-shared'

export interface ConvertFormValues {
  displayName?: string
  description?: string
  enabled: boolean
  deleteAfterConvert: boolean
}

interface ConvertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pm: PotentialModel | null
  form: UseFormReturn<ConvertFormValues>
  isPending: boolean
  onSubmit: (values: ConvertFormValues, pm: PotentialModel) => void
}

export function ConvertDialog({
  open,
  onOpenChange,
  pm,
  form,
  isPending,
  onSubmit,
}: ConvertDialogProps) {
  useEffect(() => {
    if (!open)
      form.reset({ displayName: '', description: '', enabled: true, deleteAfterConvert: true })
  }, [open, form])

  const handleSubmit = (values: ConvertFormValues) => {
    if (!pm) return
    onSubmit(values, pm)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>转换为接入模型</DialogTitle>
          <DialogDescription>
            将潜在模型 <code className="font-mono">{pm?.modelName ?? ''}</code>{' '}
            转换为正式的接入模型， 转换后可配置路由规则、能力标签等参数。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
            key={pm?.id ?? 'none'}
          >
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>显示名称</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：我的 GPT-4" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>可选，用于在前端展示的友好名称</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>描述</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="可选，描述该接入模型的用途"
                      rows={3}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
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
                    <FormLabel>启用</FormLabel>
                    <FormDescription>转换后是否立即启用该接入模型</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="deleteAfterConvert"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>转换后删除潜在模型行</FormLabel>
                    <FormDescription>
                      默认开启；关闭后，潜在模型行会保留为 observe 状态
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isPending || !pm}>
                {isPending ? '转换中...' : '转换'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
