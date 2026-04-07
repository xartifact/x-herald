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
import { Switch } from '@/ui/switch'

import { KeyAlert } from './key-display'
interface KeyFormData {
  name: string
  allowedModels: string
  rateLimitRpm?: number
  rateLimitRpd?: number
  tokenLimitDaily?: number
  enabled: boolean
  expiresAt: string
}

interface KeyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<KeyFormData>
  editingId: string | null
  isPending: boolean
  showNewKey: boolean
  newlyCreatedKey: string | null
  copiedKey: string | null
  onSubmit: (data: KeyFormData) => void
  onCopyNewKey: () => void
}

export function KeyFormDialog({
  open,
  onOpenChange,
  form,
  editingId,
  isPending,
  showNewKey,
  newlyCreatedKey,
  copiedKey,
  onSubmit,
  onCopyNewKey,
}: KeyFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? '编辑密钥' : '创建密钥'}</DialogTitle>
          <DialogDescription>
            {editingId
              ? '修改虚拟密钥配置'
              : '创建新的虚拟密钥用于访问 LLM Gateway'}
          </DialogDescription>
        </DialogHeader>

        {!editingId && showNewKey && newlyCreatedKey && (
          <KeyAlert
            keyValue={newlyCreatedKey}
            copied={copiedKey === 'new'}
            onCopy={onCopyNewKey}
          />
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <h4 className="text-sm font-medium">基本信息</h4>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密钥名称 *</FormLabel>
                    <FormControl>
                      <Input placeholder="生产环境密钥" {...field} />
                    </FormControl>
                    <FormDescription>给密钥起一个有意义的名称，便于识别用途</FormDescription>
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
                      <FormLabel>启用密钥</FormLabel>
                      <FormDescription>禁用后此密钥将无法访问 API</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium">访问限制</h4>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="rateLimitRpm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>每分钟请求数 (RPM)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="无限制"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rateLimitRpd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>每天请求数 (RPD)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="无限制"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="tokenLimitDaily"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>每日 Token 限制</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="无限制"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormDescription>每天最多消耗的 token 数量</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>过期时间</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>留空表示永不过期</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowedModels"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>允许的模型</FormLabel>
                    <FormControl>
                      <Input placeholder="gpt-4, gpt-3.5-turbo, claude-3-opus" {...field} />
                    </FormControl>
                    <FormDescription>用逗号分隔模型名称，留空表示允许访问所有模型</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
              {!showNewKey && (
                <Button type="submit" disabled={isPending}>
                  {isPending ? '保存中...' : editingId ? '保存更改' : '创建密钥'}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
