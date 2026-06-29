// Shared primitives and utilities
export * from './shared'

// Feature modules
export * from './features/admin'
export * from './features/access-models'
export * from './features/circuit-breaker'
export * from './features/client-models'
export * from './features/costs'
export * from './features/keys'
export * from './features/logs'
export * from './features/metrics'
export * from './features/model-groups'
export * from './features/model-routes'
export * from './features/providers'
export * from './features/provider-stats'
export * from './features/settings'
export * from './features/ai-assist'

// Re-export shared types for convenience
export type {
  AccessModel,
  CreateAccessModelPayload,
  UpdateAccessModelPayload,
} from '@xartifact/x-llm-gateway-shared'
export type {
  AuthResponse,
  AuthMeResponse,
} from '@xartifact/x-llm-gateway-shared'
