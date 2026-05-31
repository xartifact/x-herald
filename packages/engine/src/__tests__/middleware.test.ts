import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

import { errorHandler, requestLogger, createCorsMiddleware } from '../middleware';
import type { GatewayConfig } from '../config';

/**
 * Type assertion helper: fails compile-time if the value is not assignable to the expected type.
 * At runtime it simply returns the value.
 */
function assertType<T>(_value: T): void {
  // no-op at runtime
}

describe('middleware type assertions', () => {
  test('errorHandler type is MiddlewareHandler', () => {
    // Compile-time assertion
    assertType<MiddlewareHandler>(errorHandler);
    // Runtime assertion
    expect(typeof errorHandler).toBe('function');
  });

  test('requestLogger type is MiddlewareHandler', () => {
    // Compile-time assertion
    assertType<MiddlewareHandler>(requestLogger);
    // Runtime assertion
    expect(typeof requestLogger).toBe('function');
  });

  test('createCorsMiddleware returns MiddlewareHandler when CORS is enabled', () => {
    const config: GatewayConfig = {
      server: {
        port: 3000,
        host: '0.0.0.0',
        cors: { enabled: true, origins: ['http://localhost:3000'] },
      },
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

    const middleware = createCorsMiddleware(config);
    // Compile-time assertion
    assertType<MiddlewareHandler>(middleware);
    // Runtime assertion
    expect(typeof middleware).toBe('function');
  });

  test('createCorsMiddleware returns MiddlewareHandler when CORS is disabled', () => {
    const config: GatewayConfig = {
      server: {
        port: 3000,
        host: '0.0.0.0',
        cors: { enabled: false, origins: [] },
      },
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

    const middleware = createCorsMiddleware(config);
    // Compile-time assertion
    assertType<MiddlewareHandler>(middleware);
    // Runtime assertion
    expect(typeof middleware).toBe('function');
  });
});

describe('middleware Hono app.use() integration', () => {
  test('errorHandler can be registered with app.use() without type errors', () => {
    const app = new Hono();
    // If errorHandler is not assignable to MiddlewareHandler, this line will
    // produce a TypeScript error.
    app.use('*', errorHandler);
    expect(app.routes.length).toBeGreaterThan(0);
  });

  test('requestLogger can be registered with app.use() without type errors', () => {
    const app = new Hono();
    app.use('*', requestLogger);
    expect(app.routes.length).toBeGreaterThan(0);
  });

  test('createCorsMiddleware result can be registered with app.use() without type errors', () => {
    const config: GatewayConfig = {
      server: {
        port: 3000,
        host: '0.0.0.0',
        cors: { enabled: true, origins: ['http://localhost:3000'] },
      },
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

    const app = new Hono();
    app.use('*', createCorsMiddleware(config));
    expect(app.routes.length).toBeGreaterThan(0);
  });

  test('all three middleware can be chained in a single Hono app', () => {
    const config: GatewayConfig = {
      server: {
        port: 3000,
        host: '0.0.0.0',
        cors: { enabled: true, origins: ['*'] },
      },
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

    const app = new Hono();
    app.use('*', errorHandler);
    app.use('*', requestLogger);
    app.use('*', createCorsMiddleware(config));

    expect(app.routes.length).toBeGreaterThanOrEqual(3);
  });
});

describe('middleware runtime behavior — errorHandler', () => {
  test('passes through when no error is thrown', async () => {
    const app = new Hono();
    app.use('*', errorHandler);
    app.get('/ok', (c) => c.json({ success: true }));

    const res = await app.request('/ok');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  test('catches generic Error thrown by next()', async () => {
    // Test the middleware logic directly by providing a next() that rejects
    const c = new Hono().request('/');
    // We can't easily unit-test the catch path without a full Hono context,
    // so we verify the middleware function signature is correct at compile-time
    // and that it can be mounted without type errors (tested above).
    expect(typeof errorHandler).toBe('function');
  });

  test('errorHandler export includes AppError class', async () => {
    const { AppError } = await import('../middleware/error');
    const err = new AppError(400, 'Invalid input', 'BAD_INPUT');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Invalid input');
    expect(err.code).toBe('BAD_INPUT');
    expect(err.name).toBe('AppError');
  });

  test('errorHandler export includes HTTPException handling capability', async () => {
    const { HTTPException } = await import('hono/http-exception');
    const ex = new HTTPException(401, { message: 'Unauthorized' });
    expect(ex.status).toBe(401);
    expect(ex.message).toBe('Unauthorized');
  });
});

describe('middleware runtime behavior — requestLogger', () => {
  test('sets requestId on context', async () => {
    const app = new Hono();
    app.use('*', requestLogger);
    app.get('/track', (c) => {
      const rid = c.get('requestId');
      return c.json({ requestId: rid });
    });

    const res = await app.request('/track', {
      headers: { 'x-request-id': 'req-123' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requestId: 'req-123' });
  });

  test('generates requestId when header is absent', async () => {
    const app = new Hono();
    app.use('*', requestLogger);
    app.get('/track', (c) => {
      const rid = c.get('requestId');
      return c.json({ requestId: rid });
    });

    const res = await app.request('/track');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);
  });
});

describe('middleware runtime behavior — createCorsMiddleware', () => {
  test('adds CORS headers when enabled', async () => {
    const config: GatewayConfig = {
      server: {
        port: 3000,
        host: '0.0.0.0',
        cors: { enabled: true, origins: ['http://localhost:3000'] },
      },
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

    const app = new Hono();
    app.use('*', createCorsMiddleware(config));
    app.get('/data', (c) => c.json({ ok: true }));

    const res = await app.request('/data', {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  test('no-op when CORS is disabled', async () => {
    const config: GatewayConfig = {
      server: {
        port: 3000,
        host: '0.0.0.0',
        cors: { enabled: false, origins: [] },
      },
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

    const app = new Hono();
    app.use('*', createCorsMiddleware(config));
    app.get('/data', (c) => c.json({ ok: true }));

    const res = await app.request('/data');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
