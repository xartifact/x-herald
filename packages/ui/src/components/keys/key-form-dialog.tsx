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

import { KeyBasicFields } from './key-basic-fields'
import { KeyAlert } from './key-display'
import type { KeyFormData } from './key-form-types'
import { KeyPermissionFields } from './key-permission-fields'

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
  open, onOpenChange, form, editingId, isPending,
  showNewKey, newlyCreatedKey, copiedKey, onSubmit, onCopyNewKey,
}: KeyFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? '编辑密钥' : '创建密钥'}</DialogTitle>
          <DialogDescription>
            {editingId ? '修改虚拟密钥配置' : '创建新的虚拟密钥用于访问 LLM Gateway'}
          </DialogDescription>
        </DialogHeader>

        {!editingId && showNewKey && newlyCreatedKey && (
          <KeyAlert keyValue={newlyCreatedKey} copied={copiedKey === 'new'} onCopy={onCopyNewKey} />
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <KeyBasicFields form={form} />
            <KeyPermissionFields form={form} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
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
