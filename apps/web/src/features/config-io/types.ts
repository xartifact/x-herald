export const EXPORT_VERSION = '1' as const;

export interface ExportedProvider {
  name: string;
  apiKey: string | null;
  protocols: unknown;
  enabled: boolean;
}

export interface ExportedModelGroup {
  name: string;
  aliases: string[];
  displayName: string;
  description: string | null;
  category: string;
  capabilities: unknown;
  supportedProtocols: string[];
  enabled: boolean;
  metadata: unknown;
}

export interface ExportedModelInstance {
  name: string;
  actualModelName: string;
  description: string | null;
  /** 用于导入时解析 providerId */
  providerName: string;
  /** 用于导入时解析 groupIds（多对多） */
  groupNames: string[];
  /** @deprecated use groupNames */
  groupName: string | null;
  config: unknown;
  weight: number;
  priority: number;
  costPer1kTokens: unknown;
  healthCheckUrl: string | null;
  enabled: boolean;
  metadata: unknown;
}

export interface ExportedAccessModel {
  name: string;
  displayName: string | null;
  description: string | null;
  enabled: boolean;
}

/** @deprecated use ExportedAccessModel */
export type ExportedVirtualModel = ExportedAccessModel;

export interface ExportedModelRoute {
  name: string;
  description: string | null;
  /** 用于导入时解析 virtualModelId */
  virtualModelName: string | null;
  conditions: unknown[];
  action: {
    type: string;
    /**
     * 用于导入时解析 targetId：
     * - route_to_virtual_model: virtual_model.name
     * - route_to_group: model_group.name
     * - route_to_instance: "{providerName}/{actualModelName}"
     */
    targetRef?: string;
    reason?: string;
  };
  priority: number;
  enabled: boolean;
  flowData: unknown;
}

export interface ExportedVirtualKey {
  name: string;
  key: string;
  allowedModels: string[] | null;
  rateLimitRpm: number | null;
  rateLimitRpd: number | null;
  tokenLimitDaily: string | null; // bigint serialized as string
  enabled: boolean;
  expiresAt: string | null;
}

export interface ExportedGatewayConfig {
  key: string;
  value: unknown;
  description: string | null;
}

export interface ExportFormat {
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  data: {
    providers: ExportedProvider[];
    modelGroups: ExportedModelGroup[];
    modelInstances: ExportedModelInstance[];
    accessModels?: ExportedAccessModel[];
    /** @deprecated use accessModels */
    virtualModels: ExportedAccessModel[];
    modelRoutes: ExportedModelRoute[];
    virtualKeys: ExportedVirtualKey[];
    gatewayConfigs: ExportedGatewayConfig[];
  };
}

export interface ImportSummaryItem {
  created: number;
  updated: number;
  errors: number;
}

export interface ImportResult {
  success: boolean;
  summary: {
    providers: ImportSummaryItem;
    modelGroups: ImportSummaryItem;
    modelInstances: ImportSummaryItem;
    accessModels: ImportSummaryItem;
    /** @deprecated use accessModels */
    virtualModels: ImportSummaryItem;
    modelRoutes: ImportSummaryItem;
    virtualKeys: ImportSummaryItem;
    gatewayConfigs: ImportSummaryItem;
  };
  errors: string[];
}
