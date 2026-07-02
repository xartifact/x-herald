import { Hono } from 'hono'
import { createTestEngine, destroyTestEngine, getAuthToken } from './setup'
import { authenticatedRequest, testRequest } from './hono-helper'

export interface ApiResponse<T = Record<string, unknown>> {
  success: boolean
  data: T
  total?: number
  code?: string
  message?: string
  error?: string
}

export interface CrudTestContext {
  app: Hono
  token: string
}

export async function setupCrudTest(): Promise<CrudTestContext> {
  const engine = await createTestEngine()
  const token = await getAuthToken(engine.app)
  return { app: engine.app, token }
}

export async function teardownCrudTest(): Promise<void> {
  await destroyTestEngine()
}

export async function parseJson<T = Record<string, unknown>>(
  res: Response,
): Promise<{ status: number; body: ApiResponse<T> }> {
  const body = (await res.json()) as ApiResponse<T>
  return { status: res.status, body }
}

export function uniqueName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export function authGet(ctx: CrudTestContext, path: string): Response | Promise<Response> {
  return authenticatedRequest(ctx.app, 'GET', path, ctx.token)
}

export function authPost(
  ctx: CrudTestContext,
  path: string,
  body?: Record<string, unknown>,
): Response | Promise<Response> {
  return authenticatedRequest(ctx.app, 'POST', path, ctx.token, body ? { body } : undefined)
}

export function authPut(
  ctx: CrudTestContext,
  path: string,
  body?: Record<string, unknown>,
): Response | Promise<Response> {
  return authenticatedRequest(ctx.app, 'PUT', path, ctx.token, body ? { body } : undefined)
}

export function authDelete(ctx: CrudTestContext, path: string): Response | Promise<Response> {
  return authenticatedRequest(ctx.app, 'DELETE', path, ctx.token)
}

export function unauthGet(ctx: CrudTestContext, path: string): Response | Promise<Response> {
  return testRequest(ctx.app, 'GET', path)
}
