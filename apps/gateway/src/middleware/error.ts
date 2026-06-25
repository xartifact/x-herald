import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ErrorReporter } from '@x-tinker/sdk';

import rootLogger from '../lib/logger';

const logger = rootLogger.child({ module: 'http' });

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

// x-tinker reporter instance (lazily initialized from env)
let xTinkerReporter: ErrorReporter | null = null;
function getReporter(): ErrorReporter | null {
  if (xTinkerReporter) return xTinkerReporter;
  const url = process.env.X_TINKER_URL;
  if (!url) return null;
  xTinkerReporter = new ErrorReporter({
    serverUrl: url,
    projectId: process.env.X_TINKER_PROJECT_ID || 'x-llm-gateway',
  });
  return xTinkerReporter;
}

export const errorHandler: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (error) {
    logger.error({ err: error }, 'Request error');

    // Report to x-tinker with request context
    const reporter = getReporter();
    if (reporter && error instanceof Error) {
      reporter.report(error, undefined, {
        request_path: c.req.path,
        request_method: c.req.method,
        request_id: c.get('requestId') as string || '',
      }).catch(() => {});
    }

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
        error.statusCode as 400 | 401 | 403 | 404 | 500
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
};
