import { UseFormReturn } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '../../../shared/components/ui/form'
import { Input } from '../../../shared/components/ui/input'
import { Button } from '../../../shared/components/ui/button'
import { Switch } from '../../../shared/components/ui/switch'

interface InstanceCostFieldsProps {
  form: UseFormReturn<Record<string, unknown>>
}

/**
 * 模型实例计费编辑。
 *
 * 表单字段路径（form.watch('costPer1kTokens') 的结构）：
 *   costPer1kTokens: {
 *     input: number,           // 每 1K input tokens 价格（USD）
 *     output: number,          // 每 1K output tokens 价格（USD）
 *     cache_read?: number,     // 缓存读取单价
 *     cache_write?: number,    // 缓存写入单价
 *     tiers?: Array<{          // 阶梯定价
 *       input_tokens_above: number,
 *       input: number,
 *       output: number,
 *       cache_read?: number,
 *       cache_write?: number,
 *     }>
 *   }
 *
 * 数据来源：provider 同步时自动填充，用户可手动覆盖。
 * 优先级：instance.costPer1kTokens > CostService 默认 provider 费率。
 */
export function InstanceCostFields({ form }: InstanceCostFieldsProps) {
  const tiers =
    (form.watch('costPer1kTokens.tiers') as unknown as Array<Record<string, unknown>>) ?? []

  const addTier = () => {
    const newTier = { input_tokens_above: 0, input: 0, output: 0 }
    form.setValue('costPer1kTokens.tiers' as any, [...tiers, newTier], { shouldDirty: true })
  }

  const removeTier = (index: number) => {
    form.setValue(
      'costPer1kTokens.tiers' as any,
      tiers.filter((_, i) => i !== index),
      { shouldDirty: true },
    )
  }

  return (
    <div className="space-y-4 pt-4 border-t">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">计费配置</h4>
          <p className="text-xs text-muted-foreground">每 1,000 tokens 单价（USD）</p>
        </div>
        <FormField
          control={form.control}
          name="costPer1kTokens._enabled"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormLabel className="text-xs text-muted-foreground mb-0">启用自定义</FormLabel>
              <FormControl>
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      {form.watch('costPer1kTokens._enabled') && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="costPer1kTokens.input"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>输入单价</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.000001"
                      min={0}
                      placeholder="0.005"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>每 1K input tokens</FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="costPer1kTokens.output"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>输出单价</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.000001"
                      min={0}
                      placeholder="0.015"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>每 1K output tokens</FormDescription>
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="costPer1kTokens.cache_read"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>缓存读取单价</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.000001"
                      min={0}
                      placeholder="可选"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                        )
                      }
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="costPer1kTokens.cache_write"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>缓存写入单价</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.000001"
                      min={0}
                      placeholder="可选"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                        )
                      }
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* 阶梯定价 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <FormLabel className="text-sm">阶梯定价</FormLabel>
              <Button type="button" variant="outline" size="sm" onClick={addTier}>
                <Plus className="mr-1 h-3 w-3" />
                添加阶梯
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              当总输入 tokens 超过阈值时切换到该档价格
            </p>
            {tiers.map((_, index) => (
              // eslint-disable-next-line react/no-array-index-key -- 表单路径按索引寻址（tiers.${index}.*），index 即稳定身份；按内容键会在编辑阈值时重挂载丢焦点
              <div key={index} className="flex items-end gap-2 rounded-lg border p-3">
                <FormField
                  control={form.control}
                  name={`costPer1kTokens.tiers.${index}.input_tokens_above`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="text-xs">Token 阈值</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          placeholder="200000"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`costPer1kTokens.tiers.${index}.input`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="text-xs">输入单价</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.000001"
                          min={0}
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`costPer1kTokens.tiers.${index}.output`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="text-xs">输出单价</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.000001"
                          min={0}
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTier(index)}
                  className="mb-1"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
