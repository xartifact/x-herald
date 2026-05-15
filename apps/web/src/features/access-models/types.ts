export interface AccessModel {
  id: string
  name: string
  displayName: string | null
  description: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateAccessModelPayload {
  name: string
  displayName?: string
  description?: string
  enabled?: boolean
}

export interface UpdateAccessModelPayload {
  name?: string
  displayName?: string
  description?: string
  enabled?: boolean
}

/** @deprecated Use `AccessModel` */
export type VirtualModel = AccessModel;
/** @deprecated Use `CreateAccessModelPayload` */
export type CreateVirtualModelPayload = CreateAccessModelPayload;
/** @deprecated Use `UpdateAccessModelPayload` */
export type UpdateVirtualModelPayload = UpdateAccessModelPayload;
