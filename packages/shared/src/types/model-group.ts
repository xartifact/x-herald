export type RoutingStrategy =
  | 'round_robin'
  | 'weighted'
  | 'least_response_time'
  | 'priority'
  | 'cost_optimized'
  | 'smart'

export interface RoutingConfig {
  strategy: RoutingStrategy
  fallbackEnabled: boolean
  params?: Record<string, any>
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
  total?: number
  code?: string
  message?: string
}

export interface GroupFormData {
  name: string
  aliases: string
  displayName: string
  description: string
  category: 'chat' | 'embedding' | 'image' | 'audio'
  capabilities: {
    streaming: boolean
    functionCalling: boolean
    vision: boolean
    jsonMode: boolean
    maxTokens: number
    contextWindow: number
  }
  routingStrategy: RoutingStrategy
  fallbackEnabled: boolean
}

export interface InstanceFormData {
  providerId: string
  name: string
  actualModelName: string
  description: string
  weight: number
  priority: number
  config?: {
    parameterTransforms?: Array<{
      when?: {
        paramName: string
        operator: 'eq' | 'ne' | 'exists' | 'not_exists'
        value?: unknown
      }
      action: {
        type: 'add' | 'remove' | 'rename' | 'transform'
        targetParam: string
        value?: unknown
        expression?: string
      }
    }>
    schemaConfig?: {
      cleanEnabled: boolean
      preserveFields?: string[]
      additionalBannedFields?: string[]
    }
    customHeaders?: Record<string, string>
    parameterMapping?: Record<
      string,
      {
        min?: number
        max?: number
        default?: unknown
        transform?: string
      }
    >
  }
}

export interface ModelCapabilities {
  streaming: boolean
  functionCalling: boolean
  vision: boolean
  jsonMode: boolean
  maxTokens: number
  contextWindow: number
  reasoning?: boolean
  codeInterpreter?: boolean
  webSearch?: boolean
  [key: string]: unknown
}

export interface InstanceConfig {
  parameterMapping?: Record<
    string,
    {
      min?: number
      max?: number
      default?: unknown
      transform?: string
    }
  >

  capabilityOverrides?: Partial<{
    streaming: boolean
    functionCalling: boolean
    vision: boolean
    maxTokens: number
    contextWindow: number
  }>

  customHeaders?: Record<string, string>

  supportsThinking?: boolean

  patchMissingReasoningContent?: boolean

  retryConfig?: {
    maxRetries: number
    retryDelay: number
    retryableStatusCodes: number[]
  }

  timeoutConfig?: {
    connectTimeout: number
    readTimeout: number
  }

  parameterTransforms?: Array<{
    when?: {
      paramName: string
      operator: 'eq' | 'ne' | 'exists' | 'not_exists'
      value?: unknown
    }
    action: {
      type: 'add' | 'remove' | 'rename' | 'transform'
      targetParam: string
      value?: unknown
      expression?: string
    }
  }>

  schemaConfig?: {
    cleanEnabled: boolean
    preserveFields?: string[]
    additionalBannedFields?: string[]
  }

  requestInject?: Record<string, unknown>

  requestTransform?: string

  responseExtract?: Record<string, string>

  responseTransform?: string
}

export interface ModelGroup {
  id: string
  name: string
  aliases: string[] | null
  displayName: string
  description: string | null
  category: string
  capabilities: ModelCapabilities
  supportedProtocols: string[] | null
  enabled: boolean
  routingConfig: RoutingConfig | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  instances?: ModelInstance[]
}

export interface ModelInstance {
  id: string
  providerId: string
  name: string
  actualModelName: string
  description: string | null
  config: InstanceConfig | null
  weight: number
  priority: number
  costPer1kTokens: { input: number; output: number } | null
  healthCheckUrl: string | null
  enabled: boolean
  status: string
  lastCheckedAt: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  provider?: { id: string; name: string }
  groupIds?: string[]
  groupId?: string | null
}

export interface ModelGroupDetail {
  group: ModelGroup
  instances: ModelInstance[]
}

export interface CreateModelGroupPayload {
  name: string
  aliases?: string[]
  displayName: string
  description?: string
  category?: string
  capabilities?: ModelCapabilities
  supportedProtocols?: string[]
  routingConfig?: RoutingConfig
  metadata?: Record<string, unknown>
}

export interface UpdateModelGroupPayload {
  name?: string
  aliases?: string[]
  displayName?: string
  description?: string
  category?: string
  capabilities?: ModelCapabilities
  supportedProtocols?: string[]
  routingConfig?: RoutingConfig
  metadata?: Record<string, unknown>
}

export interface CreateModelInstancePayload {
  groupIds?: string[]
  groupId?: string | null
  providerId: string
  name: string
  actualModelName: string
  description?: string
  weight?: number
  priority?: number
  costPer1kTokens?: {
    input: number
    output: number
  }
  config?: InstanceConfig
}

export interface UpdateModelInstancePayload {
  name?: string
  actualModelName?: string
  description?: string
  weight?: number
  priority?: number
  costPer1kTokens?: {
    input: number
    output: number
  }
  config?: InstanceConfig
}
