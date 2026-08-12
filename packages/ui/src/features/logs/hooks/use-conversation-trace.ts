import { useQuery } from '@tanstack/react-query'

import { get } from '@xartifact/x-herald-ui'

import { logKeys } from './log-types'
import type { ConversationTraceResponse } from './log-types'

export function useConversationTrace(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: logKeys.conversation(conversationId ?? ''),
    queryFn: () =>
      get<ConversationTraceResponse>(`/api/logs/conversation/${conversationId}`, {
        extractData: false,
      }),
    enabled: !!conversationId,
    staleTime: 30_000,
  })
}
