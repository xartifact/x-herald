import type { Context, MiddlewareHandler, Next } from 'hono';
import { cors } from 'hono/cors';

import type { GatewayConfig } from '../config';

export function createCorsMiddleware(config: GatewayConfig): MiddlewareHandler {
  if (!config.server.cors.enabled) {
    return async (_c: Context, next: Next) => next();
  }

  return cors({
    origin: config.server.cors.origins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    credentials: true,
  });
}
