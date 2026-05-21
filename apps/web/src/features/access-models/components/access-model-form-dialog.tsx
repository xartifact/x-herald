'use client'

import type { UseFormReturn } from 'react-hook-form'

import { Button } from '@x-llm-gateway/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@x-llm-gateway/ui'
import { Form } from '@x-llm-gateway/ui'

import type { AccessModelFormData } from '../useAccessModelPage'
import { AccessModelBasicFields } from './access-model-basic-fields'
import { AccessModelCapabilitiesFields } from './access-model-capabilities-fields'

interface AccessModelFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<AccessModelFormData>
  editingId: string | null
  isPending: boolean
  onSubmit: (data: AccessModelFormData) => void
}

export function AccessModelFormDialog({ open, onOpenChange, form, editingId, isPending, onSubmit }: AccessModelFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? '编辑接入模型' : '创建接入模型'}</DialogTitle>
          <DialogDescription>
            {editingId
              ? '修改接入模型配置。路由规则请在详情页管理。'
              : '创建一个对外暴露的接入模型名称，通过规则引擎路由到具体模型'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <AccessModelBasicFields form={form} />
            <AccessModelCapabilitiesFields form={form} />

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
