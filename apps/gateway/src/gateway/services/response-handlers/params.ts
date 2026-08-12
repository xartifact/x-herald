import type { Context } from 'hono'

import type { VirtualKey } from '@xartifact/x-herald-db'
import type { InstanceCost, TransformerContext } from '@xartifact/x-herald-shared'

export interface ResponseHandlerParams {
  c: Context
  request?: Request
  response: Response
  ctx: TransformerContext
  incomingProtocol: string
  targetProtocol: string
  virtualKey: VirtualKey
  provider: { id: string; name: string }
  originalModelName: string
  resolvedModelName?: string
  mappingType?: 'virtual' | 'exact' | 'alias' | 'fallback' | null
  isMapped?: boolean
  startTime: number
  preprocessEndTime: number
  providerTtfbTime: number
  requestHeaders: Record<string, string>
  providerRequestHeaders?: Record<string, string>
  rawBody: unknown
  standardRequestBody?: unknown
  transformedBody?: unknown
  clientIp: string
  userAgent: string
  requestPath: string
  requestMethod: string
  conversationId?: string
  isPassthroughEnabled?: boolean
  clientType?: string
  logId?: string
  attemptId?: string
  retryCount?: number
  routingTrace?: {
    matchedRuleId?: string
    matchedRuleName?: string
    matchedRulePriority?: number
    modelGroupId?: string
    modelGroupName?: string
    instanceId?: string
    actualModelName?: string
    strategy?: string
    responseModelName?: string
    instanceCost?: InstanceCost | null
  }
}
