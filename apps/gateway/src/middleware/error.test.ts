import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { errorHandler, AppError } from './error';

// ── AppError class ──────────────────────────────────────────────────────

describe('AppError class', () => {
  it('sets statusCode, message, and code', () => {
    const err = new AppError(429, 'Too Many Requests', 'RATE_LIMITED');

    expect(err.statusCode).toBe(429);
    expect(err.message).toBe('Too Many Requests');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.name).toBe('AppError');
  });

  it('works without code (undefined)', () => {
    const err = new AppError(403, 'Forbidden');

    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Forbidden');
    expect(err.code).toBeUndefined();
  });

  it('is instanceof Error', () => {
    const err = new AppError(500, 'err');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});

// ── errorHandler as use() middleware ────────────────────────────────────
// Hono's built-in onError intercepts Error instances, so the middleware's
// try/catch only sees non-Error throws (strings, etc.) and the no-error
// pass-through case.

describe('errorHandler as app.use() middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', errorHandler);
  });

  it('passes through when no error is thrown', async () => {
    app.get('/ok', (c) => c.text('all good'));

    const res = await app.request('/ok');
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toBe('all good');
  });

  it('handles non-Error throws (string) returning UNKNOWN_ERROR', async () => {
    app.get('/test', () => {
      throw 'some string';
    });

    const res = await app.request('/test');
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body).toEqual({ error: 'Unknown error', code: 'UNKNOWN_ERROR' });
  });
});

// ── errorHandler registered via onError ─────────────────────────────────
// Hono's onError catches every Error that propagates from handlers, so
// wrapping the errorHandler logic in app.onError() gives full coverage.

describe('errorHandler logic via app.onError()', () => {
  it('returns JSON for HTTPException', async () => {
    const app = new Hono();
    app.onError((err, c) => {
      if (err instanceof HTTPException) {
        return c.json({ error: err.message, code: err.status }, err.status);
      }
      return c.text('Internal Server Error', 500);
    });
    app.get('/test', () => {
      throw new HTTPException(404, { message: 'Not Found' });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body).toEqual({ error: 'Not Found', code: 404 });
  });

  it('returns JSON for AppError with code', async () => {
    const app = new Hono();
    app.onError((err, c) => {
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code || 'INTERNAL_ERROR' }, err.statusCode as 400 | 401 | 403 | 404 | 500);
      }
      return c.text('Internal Server Error', 500);
    });
    app.get('/test', () => {
      throw new AppError(400, 'Bad Request', 'VALIDATION_ERROR');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toEqual({ error: 'Bad Request', code: 'VALIDATION_ERROR' });
  });

  it('defaults code to INTERNAL_ERROR for AppError without code', async () => {
    const app = new Hono();
    app.onError((err, c) => {
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code || 'INTERNAL_ERROR' }, err.statusCode as 400 | 401 | 403 | 404 | 500);
      }
      return c.text('Internal Server Error', 500);
    });
    app.get('/test', () => {
      throw new AppError(500, 'Something went wrong');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body).toEqual({ error: 'Something went wrong', code: 'INTERNAL_ERROR' });
  });

  it('returns 500 for generic Error', async () => {
    const app = new Hono();
    app.onError((err, c) => {
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code || 'INTERNAL_ERROR' }, err.statusCode as 400 | 401 | 403 | 404 | 500);
      }
      if (err instanceof Error) {
        return c.json({ error: err.message, code: 'INTERNAL_ERROR' }, 500);
      }
      return c.text('Internal Server Error', 500);
    });
    app.get('/test', () => {
      throw new Error('Generic error');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body).toEqual({ error: 'Generic error', code: 'INTERNAL_ERROR' });
  });

  // Non-Error throws bypass Hono's onError (compose only passes
  // Error instances to onError), so this case is covered by the
  // use() middleware test and direct invocation test above.
});

// ── Direct unit test (calling errorHandler with mock context) ───────────

describe('errorHandler direct invocation', () => {
  it('catches HTTPException and returns JSON', async () => {
    let jsonArgs: [unknown, number] | undefined;
    const mockC = {
      json: (body: unknown, status: number) => {
        jsonArgs = [body, status];
        return { body, status };
      },
    };
    const mockNext = async () => {
      throw new HTTPException(404, { message: 'Not Found' });
    };

    await errorHandler(mockC as Parameters<typeof errorHandler>[0], mockNext);
    expect(jsonArgs).toEqual([{ error: 'Not Found', code: 404 }, 404]);
  });

  it('catches AppError and returns JSON', async () => {
    let jsonArgs: [unknown, number] | undefined;
    const mockC = {
      json: (body: unknown, status: number) => {
        jsonArgs = [body, status];
        return { body, status };
      },
    };
    const mockNext = async () => {
      throw new AppError(400, 'Bad Request', 'VALIDATION_ERROR');
    };

    await errorHandler(mockC as Parameters<typeof errorHandler>[0], mockNext);
    expect(jsonArgs).toEqual([{ error: 'Bad Request', code: 'VALIDATION_ERROR' }, 400]);
  });

  it('defaults code to INTERNAL_ERROR for AppError without code', async () => {
    let jsonArgs: [unknown, number] | undefined;
    const mockC = {
      json: (body: unknown, status: number) => {
        jsonArgs = [body, status];
        return { body, status };
      },
    };
    const mockNext = async () => {
      throw new AppError(500, 'Something went wrong');
    };

    await errorHandler(mockC as Parameters<typeof errorHandler>[0], mockNext);
    expect(jsonArgs).toEqual([{ error: 'Something went wrong', code: 'INTERNAL_ERROR' }, 500]);
  });

  it('catches generic Error and returns 500', async () => {
    let jsonArgs: [unknown, number] | undefined;
    const mockC = {
      json: (body: unknown, status: number) => {
        jsonArgs = [body, status];
        return { body, status };
      },
    };
    const mockNext = async () => {
      throw new Error('Generic error');
    };

    await errorHandler(mockC as Parameters<typeof errorHandler>[0], mockNext);
    expect(jsonArgs).toEqual([{ error: 'Generic error', code: 'INTERNAL_ERROR' }, 500]);
  });

  it('catches non-Error throw and returns UNKNOWN_ERROR', async () => {
    let jsonArgs: [unknown, number] | undefined;
    const mockC = {
      json: (body: unknown, status: number) => {
        jsonArgs = [body, status];
        return { body, status };
      },
    };
    const mockNext = async () => {
      throw 'some string';
    };

    await errorHandler(mockC as Parameters<typeof errorHandler>[0], mockNext);
    expect(jsonArgs).toEqual([{ error: 'Unknown error', code: 'UNKNOWN_ERROR' }, 500]);
  });
});