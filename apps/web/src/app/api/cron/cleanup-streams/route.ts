import { NextRequest, NextResponse } from 'next/server';

import { CRON_SECRET, cleanupStaleStreams } from '@x-llm-gateway/engine';

/**
 * Cron job endpoint for cleaning up stale streams
 *
 * Vercel Cron: 添加到 vercel.json
 * @example
 * ```json
 * {
 *   "crons": [{
 *     "path": "/api/cron/cleanup-streams",
 *     "schedule": "every 5 minutes"
 *   }]
 * }
 * ```
 */
export async function GET(request: NextRequest) {
  // 验证 cron secret（推荐）
  const authHeader = request.headers.get('authorization');
  const cronSecret = CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const count = await cleanupStaleStreams(5);

  return NextResponse.json({
    success: true,
    cleanedCount: count,
    timestamp: new Date().toISOString(),
  });
}
