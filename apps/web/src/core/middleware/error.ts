import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

import logger from '../lib/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    logger.error({ error }, 'Request error');

    if (error instanceof HTTPException) {
      return c.json(
        {
          error: error.message,
          code: error.status,
        },
        error.status
      );
    }

    if (error instanceof AppError) {
      return c.json(
        {
          error: error.message,
          code: error.code || 'INTERNAL_ERROR',
        },
        error.statusCode as any
      );
    }

    if (error instanceof Error) {
      return c.json(
        {
          error: error.message,
          code: 'INTERNAL_ERROR',
        },
        500
      );
    }

    return c.json(
      {
        error: 'Unknown error',
        code: 'UNKNOWN_ERROR',
      },
      500
    );
  }
}
