import { apiApp } from '@/api';

// 标记为动态路由，避免在构建时执行
export const dynamic = 'force-dynamic';

async function handler(request: Request) {
  const app = await apiApp();
  return app.fetch(request);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
