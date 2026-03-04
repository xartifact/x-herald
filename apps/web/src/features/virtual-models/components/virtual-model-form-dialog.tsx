'use client'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import type { UseFormReturn } from 'react-hook-form'
import type { VirtualModelFormData } from '../useVirtualModelPage'
import type { ModelGroup } from '@/features/model-groups/types'

interface VirtualModelFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<VirtualModelFormData>
  editingId: string | null
  isPending: boolean
  groups: ModelGroup[]
  onSubmit: (data: VirtualModelFormData) => void
}

const ROUTING_STRATEGIES = [
  { value: 'round_robin', label: '轮询 (Round Robin)' },
  { value: 'weighted', label: '权重随机 (Weighted)' },
  { value: 'priority', label: '优先级 (Priority)' },
  { value: 'smart', label: '智能路由 (Smart)' },
  { value: 'least_latency', label: '最低延迟 (Least Latency)' },
  { value: 'cost_optimized', label: '成本优化 (Cost Optimized)' },
]

export function VirtualModelFormDialog({
  open,
  onOpenChange,
  form,
  editingId,
  isPending,
  groups,
  onSubmit,
}: VirtualModelFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{editingId ? '编辑虚拟模型' : '创建虚拟模型'}</DialogTitle>
          <DialogDescription>
            {editingId
              ? '修改虚拟模型配置。映射关系请在详情页管理。'
              : '创建一个对外暴露的虚拟模型名称'}
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
                    <Input placeholder="映射到 GPT-4 Turbo 的虚拟模型" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="modelGroupId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>默认模型组</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择模型组（可选）" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.displayName} ({group.name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    兼容旧模式的直接映射，新模式建议使用映射配置
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="routingStrategy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>路由策略</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择路由策略" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROUTING_STRATEGIES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>当有多个映射目标时，使用此策略选择</FormDescription>
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
