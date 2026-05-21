export interface AccessModel {
  id: string
  name: string
  displayName: string | null
  description: string | null
  enabled: boolean
  capabilities: Record<string, any> | null
  createdAt: string
  updatedAt: string
}

export interface CreateAccessModelPayload {
  name: string
  displayName?: string
  description?: string
  enabled?: boolean
  capabilities?: Record<string, any> | null
}

export interface UpdateAccessModelPayload {
  name?: string
  displayName?: string
  description?: string
  enabled?: boolean
  capabilities?: Record<string, any> | null
}
