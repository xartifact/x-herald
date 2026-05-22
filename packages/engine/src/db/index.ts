
// Core client
export { createDatabase, getDatabase, closeDatabase, type Database, type DatabaseOptions } from "./client";

// Aggregated schemas

export { providers, type Provider, type NewProvider } from "../features/providers/db";
export { modelGroups, modelInstances, modelInstancesRelations, modelGroupMemberships, virtualModels, type ModelCapabilities, type ModelGroupMembership, type ModelGroup, type ModelInstance, type InstanceConfig, type ModelRoute, type RouteCondition, type NewModelGroupMembership } from "../features/model-groups/db";
export { virtualKeys, type VirtualKey, type NewVirtualKey } from "../features/keys/db";
export { requestLogs, requestAttempts, clientRequestedModels, modelRequestStats, type LogMetadata, type FailoverReason, type StreamProgress, type StreamContent } from "../features/logs/db";
export { healthTargets, healthRuns } from "../features/health/db";
export { gatewayConfigs, type NewGatewayConfig } from "../features/gateway-config/db";
export { circuitBreakerEvents } from "../features/circuit-breaker/db";
export { modelRoutes, modelRoutesRelations, accessModels } from "../features/model-groups/db";

export { recordClientRequestedModel } from '../features/logs/services/client-model-recorder';

// Gateway-config service exports
export { getConfig, setConfig } from "../features/gateway-config/service";
