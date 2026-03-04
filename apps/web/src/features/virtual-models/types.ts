export interface VirtualModel {
  id: string
  name: string
  displayName: string | null
  description: string | null
  modelGroupId: string | null
  routingConfig: { strategy: string; fallbackEnabled: boolean } | null
  enabled: boolean
  createdAt: string
  updatedAt: string
  modelGroup: {
    name: string
    displayName: string | null
  } | null
  mappingCount?: number
  mappings?: ModelMappingItem[]
}

export interface ModelMappingItem {
  id: string
  targetType: 'model_group' | 'model_instance'
  targetId: string
  weight: number
  priority: number
  enabled: boolean
  createdAt: string
  updatedAt: string
  target: {
    name: string
    displayName: string | null
    providerName?: string
    actualModelName?: string
  } | null
}

export interface CreateVirtualModelPayload {
  name: string
  displayName?: string
  description?: string
  modelGroupId?: string
  routingConfig?: { strategy: string; fallbackEnabled: boolean }
  mappings?: Array<{
    targetType: 'model_group' | 'model_instance'
    targetId: string
    weight?: number
    priority?: number
  }>
  enabled?: boolean
}

export interface UpdateVirtualModelPayload {
  name?: string
  displayName?: string
  description?: string
  modelGroupId?: string | null
  routingConfig?: { strategy: string; fallbackEnabled: boolean } | null
  enabled?: boolean
}

export interface CreateMappingPayload {
  targetType: 'model_group' | 'model_instance'
  targetId: string
  weight?: number
  priority?: number
  enabled?: boolean
}

export interface UpdateMappingPayload {
  weight?: number
  priority?: number
  enabled?: boolean
}
