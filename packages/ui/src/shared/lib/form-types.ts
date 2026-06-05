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
  routingStrategy: 'round_robin' | 'weighted' | 'least_response_time' | 'priority' | 'cost_optimized' | 'smart'
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
    parameterMapping?: Record<string, {
      min?: number
      max?: number
      default?: unknown
      transform?: string
    }>
  }
}
