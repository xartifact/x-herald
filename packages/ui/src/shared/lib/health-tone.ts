import type { StatTone } from '../components/stat-card'

/**
 * 成功率/响应时间健康度分级的唯一实现。
 * 此前 provider-stats 与 metrics 两处各自维护一套不一致的阈值（成功率 99%/95% vs 95%/80%），
 * 这里统一采用更严格的网关 SLA 标准：95% 成功率对网关而言不应被视为健康。
 */
export function successRateTone(rate: number | null | undefined): StatTone {
  if (rate == null) return 'default'
  if (rate >= 0.99) return 'success'
  if (rate >= 0.95) return 'warning'
  return 'danger'
}

export function responseTimeTone(ms: number | null | undefined): StatTone {
  if (ms == null) return 'default'
  if (ms < 3000) return 'success'
  if (ms < 10000) return 'warning'
  return 'danger'
}
