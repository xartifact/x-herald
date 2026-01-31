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
  routingStrategy: 'round_robin' | 'weighted' | 'least_latency' | 'priority' | 'cost_optimized' | 'smart'
  fallbackEnabled: boolean
}

export interface InstanceFormData {
  groupId: string
  providerId: string
  name: string
  actualModelName: string
  description: string
  weight: number
  priority: number
}
