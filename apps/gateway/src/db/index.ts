// Core client
export {
  createDatabase,
  getDatabase,
  closeDatabase,
  type Database,
  type DatabaseOptions,
} from './client'

// Aggregated schemas (now from @xartifact/x-herald-db — centralized)
export { providers, type Provider, type NewProvider } from '@xartifact/x-herald-db'
export {
  modelGroups,
  modelInstances,
  modelInstancesRelations,
  modelGroupMemberships,
  accessModels,
} from '@xartifact/x-herald-db'
export { virtualKeys, type VirtualKey, type NewVirtualKey } from '@xartifact/x-herald-db'
export {
  requestLogs,
  requestAttempts,
  clientRequestedModels,
  modelRequestStats,
  intentLogs,
  INTENT_SOURCE_VALUES,
  type IntentSource,
} from '@xartifact/x-herald-db'
export { healthTargets, healthRuns } from '@xartifact/x-herald-db'
export { gatewayConfigs, type NewGatewayConfig } from '@xartifact/x-herald-db'
export { circuitBreakerEvents } from '@xartifact/x-herald-db'

// Types that are not drizzle-inferred — still needed from feature dirs
export type {
  ModelCapabilities,
  ModelGroupMembership,
  ModelGroup,
  ModelInstance,
  InstanceConfig,
  NewModelGroupMembership,
} from '../features/model-groups/db'
export type {
  LogMetadata,
  FailoverReason,
  StreamProgress,
  StreamContent,
} from '../features/logs/db'

export { recordClientRequestedModel } from '../features/logs/services/client-model-recorder'

// Gateway-config service exports
export { getConfig, setConfig } from '../features/gateway-config/service'
