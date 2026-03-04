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


import { useProviderThinkingTypeMappings, useUpdateProviderThinkingTypeMappings } from '../hooks/useThinkingTypeMappings';

const mappingSchema = z.object({
  from: z.string().min(1, '源类型不能为空'),
  to: z.string().min(1, '目标类型不能为空'),
});

const formSchema = z.object({
  mappings: z.array(mappingSchema),
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
    const { data: existingMappings, isLoading } = useProviderThinkingTypeMappings(providerId);
  const updateMappings = useUpdateProviderThinkingTypeMappings();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mappings: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'mappings',
  });

  useEffect(() => {
    if (existingMappings && open) {
      form.reset({
        mappings: existingMappings.length > 0
          ? existingMappings
          : [{ from: '', to: '' }],
      });
    }
  }, [existingMappings, open, form]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateMappings.mutateAsync({
        providerId,
        mappings: data.mappings.filter(m => m.from && m.to),
      });
      toast.success('Thinking 类型映射配置已更新');
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            <DialogTitle>Thinking 类型映射</DialogTitle>
          </div>
          <DialogDescription>
            配置 {providerName} 的 thinking 类型映射规则。当请求中的 thinking.type 匹配"源类型"时，会被替换为"目标类型"。
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-3">
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

            <div className="bg-muted p-3 rounded-md text-sm text-muted-foreground">
              <p className="font-medium mb-1">常见使用场景：</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Claude 4.6 使用 adaptive 模式，但某些 Provider 只支持 enabled/disabled</li>
                <li>将 adaptive → enabled 可解决 422 错误</li>
                <li>如果目标 Provider 支持，也可以映射到 low/medium/high</li>
              </ul>
            </div>

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
                disabled={updateMappings.isPending}
              >
                {updateMappings.isPending ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
