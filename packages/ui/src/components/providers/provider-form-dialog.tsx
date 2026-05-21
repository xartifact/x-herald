'use client'

import { UseFormReturn } from 'react-hook-form'

import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Form } from '../ui/form'

import { ProviderBasicFields } from './provider-basic-fields'
import type { ProtocolOption, ProviderFormData } from './provider-form-types'
import { ProviderProtocolFields } from './provider-protocol-fields'

interface ProviderFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<ProviderFormData>
  editingId: string | null
  isPending: boolean
  showApiKey: boolean
  onToggleShowApiKey: () => void
  onSubmit: (data: ProviderFormData) => void
  protocolOptions: readonly ProtocolOption[]
}

export function ProviderFormDialog({
  open, onOpenChange, form, editingId, isPending,
  showApiKey, onToggleShowApiKey, onSubmit, protocolOptions,
}: ProviderFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? '编辑供应商' : '添加供应商'}</DialogTitle>
          <DialogDescription>
            {editingId ? '修改供应商配置信息' : '配置新的 LLM 供应商'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <ProviderBasicFields form={form} showApiKey={showApiKey} onToggleShowApiKey={onToggleShowApiKey} />
            <ProviderProtocolFields form={form} protocolOptions={protocolOptions} />

            <DialogFooter>
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
