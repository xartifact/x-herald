export interface ExportedProvider {
  name: string
  apiKey: string | null
  protocols: unknown
  enabled: boolean
}

export interface ExportedModelGroup {
  name: string
  aliases: string[]
  displayName: string
  description: string | null
  category: string
  capabilities: unknown
  supportedProtocols: string[]
  enabled: boolean
  metadata: unknown
}

export interface ExportedModelInstance {
  name: string
  actualModelName: string
  description: string | null
  providerName: string
  groupNames: string[]
  config: unknown
  weight: number
  costPer1kTokens: unknown
  healthCheckUrl: string | null
  enabled: boolean
  metadata: unknown
}

export interface ExportedAccessModel {
  name: string
  displayName: string | null
  description: string | null
  enabled: boolean
}

export interface ExportedVirtualKey {
  name: string
  key: string
  allowedModels: string[] | null
  rateLimitRpm: number | null
  rateLimitRpd: number | null
  tokenLimitDaily: string | null
  enabled: boolean
  expiresAt: string | null
}

export interface ExportedGatewayConfig {
  key: string
  value: unknown
  description: string | null
}

export interface ExportFormat {
  version: '2'
  exportedAt: string
  data: {
    providers: ExportedProvider[]
    modelGroups: ExportedModelGroup[]
    modelInstances: ExportedModelInstance[]
    accessModels?: ExportedAccessModel[]
    virtualKeys: ExportedVirtualKey[]
    gatewayConfigs: ExportedGatewayConfig[]
  }
}

export interface ImportSummaryItem {
  created: number
  updated: number
  errors: number
}

export interface ImportResult {
  success: boolean
  summary: {
    providers: ImportSummaryItem
    modelGroups: ImportSummaryItem
    modelInstances: ImportSummaryItem
    accessModels: ImportSummaryItem
    virtualKeys: ImportSummaryItem
    gatewayConfigs: ImportSummaryItem
  }
  errors: string[]
}
