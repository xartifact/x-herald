import { eq } from '@xartifact/x-herald-db'
import type { Context, Next } from 'hono'

import { getDatabase } from '../../db/client'
import { workspaces } from '@xartifact/x-herald-db'
import { DEFAULT_WORKSPACE_ID } from './context'

export async function workspaceScopeMiddleware(c: Context, next: Next) {
  if (
    c.req.path.startsWith('/api/auth') ||
    c.req.path.startsWith('/api/health') ||
    c.req.path.startsWith('/api/v1')
  ) {
    return next()
  }
  const requestedId = c.req.header('x-workspace-id') ?? DEFAULT_WORKSPACE_ID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedId)) {
    return c.json(
      { success: false, error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' },
      404,
    )
  }
  const [workspace] = await getDatabase()
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, requestedId))
    .limit(1)

  if (!workspace) {
    return c.json(
      { success: false, error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' },
      404,
    )
  }

  c.set('workspaceId', workspace.id)
  await next()
}
