import { UseFormReturn } from 'react-hook-form'

import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '../../../shared/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../shared/components/ui/select'
import { Switch } from '../../../shared/components/ui/switch'

// Record<string, any> defined locally // TODO(6): from apps/web

const ROUTING_STRATEGIES = [
  { value: 'priority', label: '优先级', description: '按实例优先级数值从小到大依次路由，优先级相同时按创建时间排。适合主备场景。' },
  { value: 'round_robin', label: '轮询', description: '在同优先级实例间循环分发请求，各实例均等承载流量。适合实例性能相近时。' },
  { value: 'weighted', label: '加权', description: '按各实例权重随机分发，权重越高被选中概率越大。适合不同配额或性能差异较大的实例。' },
  { value: 'least_response_time', label: '最快响应', description: '优先选择近 15 分钟 TTFB 均值最低的实例，无历史数据的实例按优先级兜底。' },
  { value: 'cost_optimized', label: '成本优化', description: '优先选择 Token 单价（input + output 之和）最低的实例，未填写成本的实例排在最后。' },
  { value: 'smart', label: '智能路由', description: '综合评分（成功率 50% + TTFB 30% + 重试率 15% + 成本 5%），自动选择当前综合表现最优实例。' },
] as const

interface RoutingConfigFieldsProps {
  form: UseFormReturn<Record<string, any>>
}

export function RoutingConfigFields({ form }: RoutingConfigFieldsProps) {
  return (
    <div className="space-y-4 pt-4 border-t">
      <h4 className="text-sm font-medium">路由配置</h4>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="routingStrategy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>路由策略</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ROUTING_STRATEGIES.map((strategy) => (
                    <SelectItem key={strategy.value} value={strategy.value}>
                      {strategy.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription className="text-xs">
                {ROUTING_STRATEGIES.find((s) => s.value === field.value)?.description}
              </FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="fallbackEnabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <FormLabel className="mb-0">故障转移</FormLabel>
                <FormDescription className="text-xs">主实例失败时自动切换</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}
