'use client'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import { Switch } from '@/ui/switch'

import type { GroupFormData } from '../form-types'

const ROUTING_STRATEGIES = [
  { value: 'priority', label: '优先级', description: '按实例优先级数值从小到大依次路由，优先级相同时按创建时间排。适合主备场景。' },
  { value: 'round_robin', label: '轮询', description: '在同优先级实例间循环分发请求，各实例均等承载流量。适合实例性能相近时。' },
  { value: 'weighted', label: '加权', description: '按各实例权重随机分发，权重越高被选中概率越大。适合不同配额或性能差异较大的实例。' },
  { value: 'least_response_time', label: '最快响应', description: '优先选择近 15 分钟 TTFB 均值最低的实例，无历史数据的实例按优先级兜底。' },
  { value: 'cost_optimized', label: '成本优化', description: '优先选择 Token 单价（input + output 之和）最低的实例，未填写成本的实例排在最后。' },
  { value: 'smart', label: '智能路由', description: '综合评分（成功率 50% + TTFB 30% + 重试率 15% + 成本 5%），自动选择当前综合表现最优实例。' },
] as const

interface ModelGroupFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<GroupFormData>
  editingId: string | null
  isPending: boolean
  onSubmit: (data: GroupFormData) => void
}

export function ModelGroupForm({
  open,
  onOpenChange,
  form,
  editingId,
  isPending,
  onSubmit,
}: ModelGroupFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? '编辑模型组' : '添加模型组'}</DialogTitle>
          <DialogDescription>
            {editingId ? '修改模型组配置信息' : '创建新的模型组'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <h4 className="text-sm font-medium">基本信息</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>模型组名称 *</FormLabel>
                      <FormControl>
                        <Input placeholder="gpt-4" {...field} />
                      </FormControl>
                      <FormDescription>用于 API 调用的唯一标识</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>显示名称 *</FormLabel>
                      <FormControl>
                        <Input placeholder="GPT-4" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="aliases"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>别名</FormLabel>
                    <FormControl>
                      <Input placeholder="gpt4, openai-gpt-4" {...field} />
                    </FormControl>
                    <FormDescription>多个别名用逗号分隔，别名和模型名称一样可用于 API 调用</FormDescription>
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
                      <Input placeholder="模型组描述..." {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>类别</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="chat">对话</SelectItem>
                        <SelectItem value="embedding">嵌入</SelectItem>
                        <SelectItem value="image">图像</SelectItem>
                        <SelectItem value="audio">音频</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium">能力配置</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="capabilities.streaming"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel className="mb-0">流式输出</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="capabilities.functionCalling"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel className="mb-0">函数调用</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="capabilities.vision"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel className="mb-0">视觉能力</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="capabilities.jsonMode"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel className="mb-0">JSON 模式</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium">路由配置</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="routingStrategy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>路由策略</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ROUTING_STRATEGIES.map((strategy) => (
                            <SelectItem key={strategy.value} value={strategy.value}>
                              {strategy.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        {ROUTING_STRATEGIES.find((s) => s.value === field.value)?.description}
                      </FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fallbackEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel className="mb-0">故障转移</FormLabel>
                        <FormDescription className="text-xs">主实例失败时自动切换</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
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
