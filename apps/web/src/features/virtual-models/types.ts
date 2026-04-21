export interface VirtualModel {
  id: string
  name: string
  displayName: string | null
  description: string | null
  isDefault: boolean
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateVirtualModelPayload {
  name: string
  displayName?: string
  description?: string
  isDefault?: boolean
  enabled?: boolean
}

export interface UpdateVirtualModelPayload {
  name?: string
  displayName?: string
  description?: string
  isDefault?: boolean
  enabled?: boolean
}
