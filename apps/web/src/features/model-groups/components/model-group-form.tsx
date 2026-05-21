'use client'

import { UseFormReturn } from 'react-hook-form'

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

import type { GroupFormData } from '../form-types'
import { CapabilitiesFields } from './capabilities-fields'
import { GroupBasicFields } from './group-basic-fields'
import { RoutingConfigFields } from './routing-config-fields'

interface ModelGroupFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<GroupFormData>
  editingId: string | null
  isPending: boolean
  onSubmit: (data: GroupFormData) => void
}

export function ModelGroupForm({ open, onOpenChange, form, editingId, isPending, onSubmit }: ModelGroupFormProps) {
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
            <GroupBasicFields form={form} />
            <CapabilitiesFields form={form} />
            <RoutingConfigFields form={form} />

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
