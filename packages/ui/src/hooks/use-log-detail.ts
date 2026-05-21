import { useQuery } from '@tanstack/react-query'

import { get } from '../lib/api-client'

import { logKeys } from './log-types'
import type { LogResponse } from './log-types'

export function useLog(id: string) {
  return useQuery({
    queryKey: logKeys.detail(id),
    queryFn: () => get<LogResponse>(`/api/logs/${id}`, { extractData: false }),
    enabled: !!id,
  })
}
