import { useQuery } from '@tanstack/react-query'

import { get } from '@xartifact/x-llm-gateway-ui'
import type { AccessModelRouteOverview } from '@xartifact/x-llm-gateway-shared'

export const routeOverviewKey = ['route-overview'] as const

/**
 * 全局路由俯瞰图数据：聚合所有接入模型的路由规则。
 */
export function useRouteOverview() {
  return useQuery({
    queryKey: routeOverviewKey,
    queryFn: () => get<AccessModelRouteOverview>('/api/route-overview'),
    refetchOnWindowFocus: false,
  })
}
