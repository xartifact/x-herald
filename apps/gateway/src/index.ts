export * from './lib';
export * from './config';
export * from './middleware';
export * from './db';
export {
  transformerRegistry,
  registerTransformer,
  getTransformer,
  hasTransformer,
  registerDefaultTransformers,
} from './gateway/transformer';

// db (server-only exports)
export { seedSystemData } from '@xartifact/x-llm-gateway-db';

// createEngine factory
export { createEngine, type CreateEngineOptions, type EngineInstance } from "./createEngine";

// config-io
export { exportConfig, importConfig, EXPORT_VERSION, type ExportFormat, type ImportResult } from './features/config-io';

// model-routes
export { buildFlowFromData, compileFlowToRoutes, validateFlow, getLayoutedElements, type ModelRoute, type CreateModelRoutePayload } from './features/model-routes';

// Gateway services (needed by settings API)
export { CB_CONFIG_KEY, configureCircuitBreaker } from './gateway/services';

// Settings feature types
export type { SettingsData, SettingsFormData, CircuitBreakerConfig, AvailableModelGroup } from '@xartifact/x-llm-gateway-shared';

// Provider feature types
export type { ProtocolsConfig, SyntheticThinkingStrategy } from './features/providers/db';
export type { ThinkingTypeMapping } from './features/providers/types';

// Auth middleware (for admin API routes)
export { authMiddleware, optionalAuthMiddleware } from './features/auth/middleware';

// Access model constants
export { CATCHALL_VM_NAME } from './features/access-models/constants';

// Background jobs
export { startAutoCleanup } from './features/logs/log-cleanup';
export { startSnapshotJob } from './features/metrics/snapshot-job';
export { cleanupStaleStreams } from './gateway/services/stream-cleanup';

// Gateway service exports
export { CLIENT_REGISTRY } from './gateway/services/client-identifier';
export { logEventBus, type LiveStreamEvent } from './gateway/services/log-event-bus';
export { recoverCircuitBreakerState } from './gateway/services/circuit-breaker-state';

// Feature types (for admin UI consumers)
export type {
  ApiResponse, ModelGroupDetail,
  CreateModelGroupPayload, UpdateModelGroupPayload,
  CreateModelInstancePayload, UpdateModelInstancePayload,
  RoutingConfig,
} from '@xartifact/x-llm-gateway-shared';
export type { KeyFormData } from '@xartifact/x-llm-gateway-shared';
export type { AccessModel, NewAccessModel } from './features/model-groups/db';

