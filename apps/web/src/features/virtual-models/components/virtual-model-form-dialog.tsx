'use client'

import type { UseFormReturn } from 'react-hook-form'

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

import type { VirtualModelFormData } from '../useVirtualModelPage'


interface VirtualModelFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<VirtualModelFormData>
  editingId: string | null
  isPending: boolean
  onSubmit: (data: VirtualModelFormData) => void
}

export function VirtualModelFormDialog({
  open,
  onOpenChange,
  form,
  editingId,
  isPending,
  onSubmit,
}: VirtualModelFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{editingId ? '编辑虚拟模型' : '创建虚拟模型'}</DialogTitle>
          <DialogDescription>
            {editingId
              ? '修改虚拟模型配置。路由规则请在详情页管理。'
              : '创建一个对外暴露的虚拟模型名称，通过规则引擎路由到具体模型'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: '虚拟模型名称不能为空' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>模型名称 *</FormLabel>
                  <FormControl>
                    <Input placeholder="my-gpt4" {...field} />
                  </FormControl>
                  <FormDescription>对外暴露的模型名称，客户端使用此名称请求</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>显示名称</FormLabel>
                  <FormControl>
                    <Input placeholder="My GPT-4" {...field} />
                  </FormControl>
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
                    <Input placeholder="路由到 GPT-4 Turbo 的虚拟模型" {...field} />
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
                    <FormDescription>启用后客户端可以使用此虚拟模型名称</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
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
