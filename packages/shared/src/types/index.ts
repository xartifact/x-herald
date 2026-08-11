export * from './provider'
export * from './key'
export * from './auth'
export * from './health'
export * from './model-group'
export * from './model-route'
export * from './node-data'
export * from './canvas-graph'
export * from './node-type-registry'
export * from './routing-trace'
export * from './model-schema'
export * from './access-model'
export * from './settings'
// transformer.ts - non-conflicting types only
export type {
  TransformerConstructor,
  TransformerChainConfig,
  ProtocolDetector,
} from './transformer'
// llm.ts - primary source for all types
export * from './llm'

export * from './circuit-breaker'
export * from './log'
export * from './config-io'
export * from './potential-model'
export * from './pagination'

// Live stream event type (for real-time log streaming)
export type LiveStreamEvent =
  | {
      event: 'waiting'
      logId: string
      modelName: string
      originalModelName?: string
      providerName: string
      virtualKeyName?: string
      startTime: number
      incomingProtocol: string
    }
  | {
      event: 'started'
      logId: string
      modelName: string
      originalModelName?: string
      providerName: string
      virtualKeyName?: string
      startTime: number
      incomingProtocol: string
    }
  | {
      event: 'chunk'
      logId: string
      content?: string
      reasoningContent?: string
      usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
      }
    }
  | {
      event: 'completed'
      logId: string
      durationMs: number
      totalTokens: number
      usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
      }
    }
  | {
      event: 'aborted'
      logId: string
      reason: string
      durationMs: number
    }
  | {
      event: 'error'
      logId: string
      error: string
      durationMs: number
    }
