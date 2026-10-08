import type { Context } from 'hono'

export const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

declare module 'hono' {
  interface ContextVariableMap {
    workspaceId: string
  }
}

export function getWorkspaceId(c: Context): string {
  return c.get('workspaceId') ?? DEFAULT_WORKSPACE_ID
}
