'use client';

import { useState, useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Brain } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/ui/button';
import { Card, CardContent } from '@/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';

import type { SyntheticThinkingStrategy } from '../db';
import { useProviderThinkingConfig, useUpdateProviderThinkingConfig } from '../hooks/useThinkingTypeMappings';

const mappingSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const formSchema = z.object({
  mappings: z.array(mappingSchema),
  syntheticThinking: z.enum(['strip', 'inject']),
});

type FormData = z.infer<typeof formSchema>;

interface ThinkingTypeMappingDialogProps {
  providerId: string;
  providerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThinkingTypeMappingDialog({
  providerId,
  providerName,
  open,
  onOpenChange,
}: ThinkingTypeMappingDialogProps) {
  const { data: config, isLoading } = useProviderThinkingConfig(providerId);
  const updateConfig = useUpdateProviderThinkingConfig();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mappings: [],
      syntheticThinking: 'strip',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'mappings',
  });

  useEffect(() => {
    if (config && open) {
      form.reset({
        mappings: config.mappings,
        syntheticThinking: config.syntheticThinking,
      });
    }
  }, [config, open, form]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateConfig.mutateAsync({
        providerId,
        mappings: data.mappings.filter(m => m.from && m.to),
        syntheticThinking: data.syntheticThinking,
      });
      toast.success('Thinking 配置已更新');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '未知错误');
    }
  };

  const addMapping = () => {
    append({ from: '', to: '' });
  };

  const predefinedTypes = [
    { value: 'adaptive', label: 'adaptive (Claude 4.6)' },
    { value: 'enabled', label: 'enabled' },
    { value: 'disabled', label: 'disabled' },
    { value: 'low', label: 'low' },
    { value: 'medium', label: 'medium' },
    { value: 'high', label: 'high' },
  ];

  const syntheticThinking = form.watch('syntheticThinking');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            <DialogTitle>Thinking 配置</DialogTitle>
          </div>
          <DialogDescription>
            配置 {providerName} 的 thinking 相关参数。
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* 合成 Thinking 策略 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">合成 Thinking 策略</Label>
              <p className="text-xs text-muted-foreground">
                当对话历史中的 assistant 消息缺少 thinking 块（由非 thinking 模型生成）时的处理策略。
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => form.setValue('syntheticThinking', 'strip')}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    syntheticThinking === 'strip'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  <div className="font-medium text-sm">strip（降级）</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    移除 thinking 参数，以非 thinking 模式执行。安全，适用于有 signature 校验的 Provider。
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => form.setValue('syntheticThinking', 'inject')}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    syntheticThinking === 'inject'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  <div className="font-medium text-sm">inject（注入）</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    注入合成 thinking 块，保持 thinking 模式。适用于无 signature 校验的 Provider。
                  </div>
                </button>
              </div>
            </div>

            {/* Thinking 类型映射 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">类型映射规则</Label>
              <p className="text-xs text-muted-foreground">
                当请求中的 thinking.type 匹配"源类型"时，替换为"目标类型"。
              </p>
              {fields.map((field, index) => (
                <Card key={field.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-end gap-3">
                      <div className="flex-1 space-y-2">
                        <Label>源类型</Label>
                        <Input
                          {...form.register(`mappings.${index}.from`)}
                          placeholder="例如: adaptive"
                          list="from-types"
                        />
                        <datalist id="from-types">
                          {predefinedTypes.map(t => (
                            <option key={t.value} value={t.value} />
                          ))}
                        </datalist>
                      </div>
                      <div className="text-muted-foreground pb-2">→</div>
                      <div className="flex-1 space-y-2">
                        <Label>目标类型</Label>
                        <Input
                          {...form.register(`mappings.${index}.to`)}
                          placeholder="例如: enabled"
                          list="to-types"
                        />
                        <datalist id="to-types">
                          {predefinedTypes.map(t => (
                            <option key={t.value} value={t.value} />
                          ))}
                        </datalist>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={addMapping}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              添加映射规则
            </Button>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={updateConfig.isPending}
              >
                {updateConfig.isPending ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
