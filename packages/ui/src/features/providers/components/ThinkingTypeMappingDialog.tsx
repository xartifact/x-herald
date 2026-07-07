'use client'

import { useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Brain, Plus } from 'lucide-react'
import { useForm, useFieldArray } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '../../../shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../shared/components/ui/dialog'
import { Label } from '../../../shared/components/ui/label'

import { MappingRuleRow } from './mapping-rule-row'
import { SyntheticThinkingSelector } from './synthetic-thinking-selector'
import { formSchema, type MappingFormData } from './thinking-mapping-types'
import {
  useProviderThinkingConfig,
  useUpdateProviderThinkingConfig,
} from '../hooks/useThinkingTypeMappings'

interface ThinkingTypeMappingDialogProps {
  providerId: string
  providerName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ThinkingTypeMappingDialog({
  providerId,
  providerName,
  open,
  onOpenChange,
}: ThinkingTypeMappingDialogProps) {
  const { data: config, isLoading } = useProviderThinkingConfig(providerId)
  const updateConfig = useUpdateProviderThinkingConfig()

  const form = useForm<MappingFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { mappings: [], syntheticThinking: 'strip' },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'mappings' })

  useEffect(() => {
    if (config && open) {
      form.reset({ mappings: config.mappings, syntheticThinking: config.syntheticThinking })
    }
  }, [config, open, form])

  const onSubmit = async (data: MappingFormData) => {
    try {
      await updateConfig.mutateAsync({
        providerId,
        mappings: data.mappings.filter((m) => m.from && m.to),
        syntheticThinking: data.syntheticThinking,
      })
      toast.success('Thinking 配置已更新')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '未知错误')
    }
  }

  const syntheticThinking = form.watch('syntheticThinking')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            <DialogTitle>Thinking 配置</DialogTitle>
          </div>
          <DialogDescription>配置 {providerName} 的 thinking 相关参数。</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <SyntheticThinkingSelector
              value={syntheticThinking}
              onChange={(v) => form.setValue('syntheticThinking', v)}
            />

            <div className="space-y-3">
              <Label className="text-sm font-medium">类型映射规则</Label>
              <p className="text-xs text-muted-foreground">
                当请求中的 thinking.type 匹配"源类型"时，替换为"目标类型"。
              </p>
              {fields.map((field, index) => (
                <MappingRuleRow
                  key={field.id}
                  index={index}
                  form={form}
                  canRemove={fields.length > 1}
                  onRemove={() => remove(index)}
                />
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => append({ from: '', to: '' })}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              添加映射规则
            </Button>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={updateConfig.isPending}>
                {updateConfig.isPending ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
