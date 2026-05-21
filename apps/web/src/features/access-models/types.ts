import type { ModelCapabilities } from '@x-llm-gateway/engine'

export type { ModelCapabilities }

export interface AccessModel {
  id: string
  name: string
  displayName: string | null
  description: string | null
  enabled: boolean
  capabilities: ModelCapabilities | null
  createdAt: string
  updatedAt: string
}

export interface CreateAccessModelPayload {
  name: string
  displayName?: string
  description?: string
  enabled?: boolean
  capabilities?: ModelCapabilities | null
}

export interface UpdateAccessModelPayload {
  name?: string
  displayName?: string
  description?: string
  enabled?: boolean
  capabilities?: ModelCapabilities | null
}

/** @deprecated Use `AccessModel` */
export type VirtualModel = AccessModel;
/** @deprecated Use `CreateAccessModelPayload` */
export type CreateVirtualModelPayload = CreateAccessModelPayload;
/** @deprecated Use `UpdateAccessModelPayload` */
export type UpdateVirtualModelPayload = UpdateAccessModelPayload;
