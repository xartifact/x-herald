export const FIELDS = [
  { value: 'request.model', label: '模型名 (request.model)', numeric: false },
  { value: 'context.apiKeyName', label: 'API Key 名称 (context.apiKeyName)', numeric: false },
  { value: 'context.streaming', label: '是否流式 (context.streaming)', numeric: false },
  { value: 'context.hour', label: '当前小时 (context.hour)', numeric: true },
  { value: 'context.clientType', label: '客户端类型 (context.clientType)', numeric: false },
  { value: 'perf.anomalyLevel', label: '实例异常等级 (perf.anomalyLevel)', numeric: false },
  { value: 'perf.anomalyScore', label: '最高异常分数 (perf.anomalyScore)', numeric: true },
  { value: 'perf.successRate', label: '最低成功率 0~1 (perf.successRate)', numeric: true },
  { value: 'perf.ttfbP95', label: '最高 TTFB P95 ms (perf.ttfbP95)', numeric: true },
  { value: 'perf.healthyRatio', label: '健康实例占比 0~1 (perf.healthyRatio)', numeric: true },
]

export const STRING_OPERATORS = [
  { value: 'eq', label: '等于 (eq)' },
  { value: 'ne', label: '不等于 (ne)' },
  { value: 'in', label: '在列表中 (in)' },
  { value: 'starts_with', label: '开头匹配 (starts_with)' },
  { value: 'exists', label: '存在 (exists)' },
]

export const NUMERIC_OPERATORS = [
  { value: 'eq', label: '等于 (eq)' },
  { value: 'ne', label: '不等于 (ne)' },
  { value: 'gt', label: '大于 (>)' },
  { value: 'lt', label: '小于 (<)' },
  { value: 'gte', label: '大于等于 (>=)' },
  { value: 'lte', label: '小于等于 (<=)' },
]

export function isNumericField(f: string): boolean {
  return FIELDS.find((x) => x.value === f)?.numeric ?? false
}
