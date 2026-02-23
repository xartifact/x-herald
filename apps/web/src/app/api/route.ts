import { apiApp } from '@/api';

// 标记为动态路由
export const dynamic = 'force-dynamic';

function handler(request: Request) {
  const app = apiApp();
  if (!app) {
    return new Response('API not initialized', { status: 500 });
  }
  return app.fetch(request);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
