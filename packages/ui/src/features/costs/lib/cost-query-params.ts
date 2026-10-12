import type { DateRangeFilter } from '../components/cost-date-filter'

/**
 * 把 date-only 过滤条件（本地日历日）转换为含端点的 ISO 时间戳。
 *
 * 后端对 endDate 用 `createdAt <= new Date(endDate)` 比较；裸 `YYYY-MM-DD`
 * 会被解析为 UTC 零点，导致“今天”窗口退化为单个瞬间、整天记录被排除。
 * 这里在本地时区展开为 [当日 00:00, 当日 23:59:59.999] 再转成 UTC ISO。
 */
export function toCostQueryParams(filter: Pick<DateRangeFilter, 'startDate' | 'endDate'>): {
  startDate?: string
  endDate?: string
} {
  const params: { startDate?: string; endDate?: string } = {}
  if (filter.startDate) {
    params.startDate = new Date(`${filter.startDate}T00:00:00`).toISOString()
  }
  if (filter.endDate) {
    params.endDate = new Date(`${filter.endDate}T23:59:59.999`).toISOString()
  }
  return params
}
