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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/components/ui/select'
import { Textarea } from '../../../shared/components/ui/textarea'

import type { AccessModel, PotentialModel } from '@xartifact/x-llm-gateway-shared'

export interface RouteToFormValues {
  targetAccessModelId: string
  note?: string
}

interface RouteToDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pm: PotentialModel | null
  accessModels: AccessModel[]
  form: UseFormReturn<RouteToFormValues>
  isPending: boolean
  onSubmit: (values: RouteToFormValues, pm: PotentialModel) => void
}

export function RouteToDialog({
  open,
  onOpenChange,
  pm,
  accessModels,
  form,
  isPending,
  onSubmit,
}: RouteToDialogProps) {
  useEffect(() => {
    if (!open) form.reset({ targetAccessModelId: '', note: '' })
  }, [open, form])

  const handleSubmit = (values: RouteToFormValues) => {
    if (!pm) return
    onSubmit(values, pm)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>路由至接入模型</DialogTitle>
          <DialogDescription>
            将潜在模型 <code className="font-mono">{pm?.modelName ?? ''}</code>{' '}
            的请求改写到目标接入模型， 后续将享受完整的路由能力（路由规则 / 故障转移 / 熔断 /
            限流等）。
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
              name="targetAccessModelId"
              rules={{ required: '请选择目标接入模型' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>目标接入模型 *</FormLabel>
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择已启用的接入模型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {accessModels.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          暂无可用的接入模型
                        </SelectItem>
                      ) : (
                        accessModels.map((am) => (
                          <SelectItem key={am.id} value={am.id}>
                            {am.displayName ? `${am.displayName} (${am.name})` : am.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>仅显示已启用的接入模型</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>备注</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="可选，记录路由的目的或决策依据"
                      rows={3}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isPending || !pm}>
                {isPending ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
