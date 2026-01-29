import { cors } from 'hono/cors';
import type { GatewayConfig } from '@x-llm-gateway/config';

export function createCorsMiddleware(config: GatewayConfig) {
  if (!config.server.cors.enabled) {
    return async (_c: any, next: any) => next();
  }

  return cors({
    origin: config.server.cors.origins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    credentials: true,
  });
}
