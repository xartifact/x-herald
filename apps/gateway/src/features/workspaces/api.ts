import { Hono } from 'hono'

import { createWorkspace, deleteWorkspace, listWorkspaces, updateWorkspace } from './service'

export const workspacesRoutes = new Hono()

workspacesRoutes.get('/', async (c) => c.json({ success: true, data: await listWorkspaces() }))

workspacesRoutes.post('/', async (c) => {
  const body = await c.req.json<{ name?: string }>()
  if (!body.name?.trim()) {
    return c.json({ success: false, error: 'Workspace name is required' }, 400)
  }
  try {
    return c.json({ success: true, data: await createWorkspace(body.name) }, 201)
  } catch {
    return c.json({ success: false, error: 'Workspace name already exists' }, 409)
  }
})

workspacesRoutes.put('/:id', async (c) => {
  const body = await c.req.json<{ name?: string }>()
  if (!body.name?.trim()) {
    return c.json({ success: false, error: 'Workspace name is required' }, 400)
  }
  try {
    const updated = await updateWorkspace(c.req.param('id'), body.name)
    if (!updated) return c.json({ success: false, error: 'Workspace not found' }, 404)
    return c.json({ success: true, data: updated })
  } catch {
    return c.json({ success: false, error: 'Workspace name already exists' }, 409)
  }
})

workspacesRoutes.delete('/:id', async (c) => {
  const result = await deleteWorkspace(c.req.param('id'))
  if ('error' in result) {
    if (result.error === 'NOT_FOUND')
      return c.json({ success: false, error: 'Workspace not found' }, 404)
    if (result.error === 'DEFAULT_WORKSPACE') {
      return c.json({ success: false, error: 'The default workspace cannot be deleted' }, 400)
    }
    return c.json({ success: false, error: 'Workspace must be empty before deletion' }, 409)
  }
  return c.json({ success: true })
})
