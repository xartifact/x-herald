export interface Workspace {
  id: string
  name: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateWorkspacePayload {
  name: string
}
