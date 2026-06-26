
// Core client
export { createDatabase, getDatabase, closeDatabase, type Database, type DatabaseOptions } from "./client";

// Aggregated schemas (now from @x-llm-gateway/db — centralized)
export { providers, type Provider, type NewProvider } from "@x-llm-gateway/db";
export { modelGroups, modelInstances, modelInstancesRelations, modelGroupMemberships, accessModels } from "@x-llm-gateway/db";
export { virtualKeys, type VirtualKey, type NewVirtualKey } from "@x-llm-gateway/db";
export { requestLogs, requestAttempts, clientRequestedModels, modelRequestStats } from "@x-llm-gateway/db";
export { healthTargets, healthRuns } from "@x-llm-gateway/db";
export { gatewayConfigs, type NewGatewayConfig } from "@x-llm-gateway/db";
export { circuitBreakerEvents } from "@x-llm-gateway/db";
export { modelRoutes, modelRoutesRelations } from "@x-llm-gateway/db";

// Types that are not drizzle-inferred — still needed from feature dirs
export type { ModelCapabilities, ModelGroupMembership, ModelGroup, ModelInstance, InstanceConfig, RouteCondition, NewModelGroupMembership } from "../features/model-groups/db";
export type { LogMetadata, FailoverReason, StreamProgress, StreamContent } from "../features/logs/db";

export { recordClientRequestedModel } from '../features/logs/services/client-model-recorder';

// Gateway-config service exports
export { getConfig, setConfig } from "../features/gateway-config/service";
