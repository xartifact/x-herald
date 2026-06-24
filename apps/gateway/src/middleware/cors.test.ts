import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';

import type { GatewayConfig } from '../config';
import { createCorsMiddleware } from './cors';

function makeConfig(cors: { enabled: boolean; origins: string[] }): GatewayConfig {
  return {
    server: { port: 3000, host: '0.0.0.0', cors },
    database: {
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
      ssl: false,
      dataDir: '',
    },
    admin: { password: 'test' },
    metrics: { memoryBufferSize: 1000, flushIntervalMs: 5000, retentionDays: 7 },
    health: { checkIntervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
    circuitBreaker: { failureThreshold: 5, timeout: 30000, resetTimeout: 30000 },
    sameProtocolPassthrough: { enabled: false, allowedProtocols: ['openai'] },
    logger: { level: 'info', enableRequestLog: true, enableDebug: false },
  };
}

describe('createCorsMiddleware', () => {
  it('no CORS headers when cors is disabled (even with Origin header)', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware(makeConfig({ enabled: false, origins: [] })));
    app.get('/test', (c) => c.text('ok'));

    const res = await app.request('/test', {
      headers: { Origin: 'http://example.com' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('access-control-allow-methods')).toBeNull();
    expect(res.headers.get('access-control-allow-headers')).toBeNull();
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('adds CORS headers (allow-origin, credentials, expose-headers) for GET with matching origin', async () => {
    const app = new Hono();
    app.use(
      '*',
      createCorsMiddleware(
        makeConfig({ enabled: true, origins: ['http://localhost:3000'] })
      )
    );
    app.get('/test', (c) => c.text('ok'));

    const res = await app.request('/test', {
      headers: { Origin: 'http://localhost:3000' },
    });

    // For non-preflight GET requests, only allow-origin, credentials, and expose-headers are set
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('access-control-expose-headers')).toContain('Content-Length');
    // allow-methods and allow-headers are preflight-only — not set on GET
    expect(res.headers.get('access-control-allow-methods')).toBeNull();
    expect(res.headers.get('access-control-allow-headers')).toBeNull();
  });

  it('reflects configured origin back in allow-origin header', async () => {
    const app = new Hono();
    app.use(
      '*',
      createCorsMiddleware(
        makeConfig({ enabled: true, origins: ['https://example.com'] })
      )
    );
    app.get('/test', (c) => c.text('ok'));

    const res = await app.request('/test', {
      headers: { Origin: 'https://example.com' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.com');
  });

  it('handles OPTIONS preflight — returns allow-methods and allow-headers', async () => {
    const app = new Hono();
    app.use(
      '*',
      createCorsMiddleware(
        makeConfig({ enabled: true, origins: ['http://localhost:3000'] })
      )
    );
    app.options('/test', (c) => c.text('ok'));

    const res = await app.request('/test', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(res.headers.get('access-control-allow-methods')).toContain('DELETE');
    expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type');
    // Preflight returns 204 No Content
    expect(res.status).toBe(204);
  });
});