import { eq, gte, lte, sql, desc, lt, isNotNull, and } from 'drizzle-orm';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';

import { getDatabase } from '@/core/db/client';
import { getAiModel, AiNotConfiguredError } from '@/core/lib/ai-caller';
import rootLogger from '@/core/lib/logger';

const logger = rootLogger.child({ module: 'logs' });

import { requestLogs } from './db';
import { recalculateAll } from './services/rank-calculator';
import { authMiddleware } from '../auth/middleware';

const logsRoutes = new Hono();

// Module-level concurrency guard
let isRecalculating = false;

// POST /api/logs/rank-recalculate - CRON endpoint with Bearer token authentication
logsRoutes.post('/rank-recalculate', async (c) => {
  const authHeader = c.req.header('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Fail-safe: reject if CRON_SECRET is not configured
  if (!cronSecret) {
    logger.error('CRON_SECRET environment variable not configured');
    return c.json({ error: 'Server misconfiguration', code: 'CONFIG_ERROR' }, 500);
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
  }

  // Concurrency guard
  if (isRecalculating) {
    return c.json(
      { error: 'Recalculation already in progress', code: 'RANK_RECALC_IN_PROGRESS' },
      409
    );
  }

  isRecalculating = true;
  try {
    const result = await recalculateAll();
    logger.info(result, 'Rank recalculation completed');
    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, 'Rank recalculation failed');
    return c.json(
      { error: 'Failed to recalculate ranks', code: 'RANK_RECALC_ERROR' },
      500
    );
  } finally {
    isRecalculating = false;
  }
});

// Auth middleware applies to all routes AFTER this point
logsRoutes.use('*', authMiddleware);

// GET /api/logs - 列出日志（带分页和筛选）
logsRoutes.get('/', async (c) => {
  try {
    const db = getDatabase();
    const query = c.req.query();

    // 分页参数
    const page = parseInt(query.page || '1');
    const pageSize = parseInt(query.pageSize || '20');
    const offset = (page - 1) * pageSize;

    // 筛选条件
    const conditions = [];

    if (query.virtualKeyId) {
      conditions.push(eq(requestLogs.virtualKeyId, query.virtualKeyId));
    }

    if (query.modelName) {
      conditions.push(eq(requestLogs.modelName, query.modelName));
    }

    if (query.status) {
      conditions.push(eq(requestLogs.status, query.status as 'success' | 'failure' | 'pending'| 'failure'));
    }

    if (query.startDate) {
      conditions.push(gte(requestLogs.createdAt, new Date(query.startDate)));
    }

    if (query.endDate) {
      conditions.push(lte(requestLogs.createdAt, new Date(query.endDate)));
    }

    if (query.clientType) {
      conditions.push(eq(requestLogs.clientType, query.clientType));
    }

    // 查询总数
    const countQuery =
      conditions.length > 0
        ? db.select({ count: sql<number>`count(*)` }).from(requestLogs).where(and(...conditions))
        : db.select({ count: sql<number>`count(*)` }).from(requestLogs);

    const countResult = await countQuery;
    const total = Number(countResult[0]?.count || 0);

    // 查询数据 - 只选择列表需要的字段（优化性能，减少数据传输）
    const dataQuery =
      conditions.length > 0
        ? db
            .select({
              id: requestLogs.id,
              status: requestLogs.status,
              statusCode: requestLogs.statusCode,
              modelName: requestLogs.modelName,
              originalModelName: requestLogs.originalModelName,
              providerId: requestLogs.providerId,
              providerName: requestLogs.providerName,
              virtualKeyId: requestLogs.virtualKeyId,
              virtualKeyName: requestLogs.virtualKeyName,
              latencyMs: requestLogs.latencyMs,
              inputTokens: requestLogs.inputTokens,
              outputTokens: requestLogs.outputTokens,
              totalTokens: requestLogs.totalTokens,
              streaming: requestLogs.streaming,
              errorMessage: requestLogs.errorMessage,
              errorType: requestLogs.errorType,
              clientType: requestLogs.clientType,
              requestPath: requestLogs.requestPath,
              createdAt: requestLogs.createdAt,
              isComplete: requestLogs.isComplete,
            })
            .from(requestLogs)
            .where(and(...conditions))
            .orderBy(desc(requestLogs.createdAt))
            .limit(pageSize)
            .offset(offset)
        : db
            .select({
              id: requestLogs.id,
              status: requestLogs.status,
              statusCode: requestLogs.statusCode,
              modelName: requestLogs.modelName,
              originalModelName: requestLogs.originalModelName,
              providerId: requestLogs.providerId,
              providerName: requestLogs.providerName,
              virtualKeyId: requestLogs.virtualKeyId,
              virtualKeyName: requestLogs.virtualKeyName,
              latencyMs: requestLogs.latencyMs,
              inputTokens: requestLogs.inputTokens,
              outputTokens: requestLogs.outputTokens,
              totalTokens: requestLogs.totalTokens,
              streaming: requestLogs.streaming,
              errorMessage: requestLogs.errorMessage,
              errorType: requestLogs.errorType,
              clientType: requestLogs.clientType,
              requestPath: requestLogs.requestPath,
              createdAt: requestLogs.createdAt,
              isComplete: requestLogs.isComplete,
            })
            .from(requestLogs)
            .orderBy(desc(requestLogs.createdAt))
            .limit(pageSize)
            .offset(offset);

    const logs = await dataQuery;

    return c.json({
      success: true,
      data: logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list logs');
    return c.json(
      {
        error: 'Failed to list logs',
        code: 'LOGS_LIST_ERROR',
      },
      500
    );
  }
});

// GET /api/logs/client-models - 获取客户端请求模型统计
logsRoutes.get('/client-models', async (c) => {
  try {
    const db = getDatabase();
    const query = c.req.query();

    // 时间范围筛选
    const conditions = [];
    if (query.startDate) {
      conditions.push(gte(requestLogs.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      conditions.push(lte(requestLogs.createdAt, new Date(query.endDate)));
    }

    // 只统计有 originalModelName 的记录
    conditions.push(isNotNull(requestLogs.originalModelName));

    // 按客户端请求模型统计
    const baseQuery = conditions.length > 1
      ? db.select({
          originalModelName: requestLogs.originalModelName,
          requestCount: sql<number>`count(*)`,
          successCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`,
          failureCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`,
          totalInputTokens: sql<number>`sum(${requestLogs.inputTokens})`,
          totalOutputTokens: sql<number>`sum(${requestLogs.outputTokens})`,
          totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
          avgLatency: sql<number>`avg(${requestLogs.latencyMs})`,
          lastRequestAt: sql<string>`max(${requestLogs.createdAt})`,
        }).from(requestLogs).where(and(...conditions))
      : db.select({
          originalModelName: requestLogs.originalModelName,
          requestCount: sql<number>`count(*)`,
          successCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`,
          failureCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`,
          totalInputTokens: sql<number>`sum(${requestLogs.inputTokens})`,
          totalOutputTokens: sql<number>`sum(${requestLogs.outputTokens})`,
          totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
          avgLatency: sql<number>`avg(${requestLogs.latencyMs})`,
          lastRequestAt: sql<string>`max(${requestLogs.createdAt})`,
        }).from(requestLogs).where(isNotNull(requestLogs.originalModelName));

    const stats = await baseQuery.groupBy(requestLogs.originalModelName);

    // 处理数据并添加排序字段
    const processedStats = stats.map((stat) => ({
      originalModelName: stat.originalModelName,
      requestCount: Number(stat.requestCount),
      successCount: Number(stat.successCount),
      failureCount: Number(stat.failureCount),
      totalInputTokens: Number(stat.totalInputTokens || 0),
      totalOutputTokens: Number(stat.totalOutputTokens || 0),
      totalTokens: Number(stat.totalTokens || 0),
      avgLatency: Number(stat.avgLatency || 0),
      lastRequestAt: stat.lastRequestAt,
    }));

    return c.json({
      success: true,
      data: processedStats,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get client model stats');
    return c.json(
      {
        error: 'Failed to get client model stats',
        code: 'CLIENT_MODEL_STATS_ERROR',
      },
      500
    );
  }
});

// GET /api/logs/:id - 获取日志详情
logsRoutes.get('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    const log = await db.select().from(requestLogs).where(eq(requestLogs.id, id)).limit(1);

    if (!log || log.length === 0) {
      return c.json(
        {
          error: 'Log not found',
          code: 'LOG_NOT_FOUND',
        },
        404
      );
    }

    return c.json({
      success: true,
      data: log[0],
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get log');
    return c.json(
      {
        error: 'Failed to get log',
        code: 'LOG_GET_ERROR',
      },
      500
    );
  }
});

// DELETE /api/logs/:id - 删除日志
logsRoutes.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const db = getDatabase();

    const existing = await db.select().from(requestLogs).where(eq(requestLogs.id, id)).limit(1);

    if (!existing || existing.length === 0) {
      return c.json(
        {
          error: 'Log not found',
          code: 'LOG_NOT_FOUND',
        },
        404
      );
    }

    await db.delete(requestLogs).where(eq(requestLogs.id, id));

    logger.info({ logId: id }, 'Log deleted');

    return c.json({
      success: true,
      message: 'Log deleted successfully',
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete log');
    return c.json(
      {
        error: 'Failed to delete log',
        code: 'LOG_DELETE_ERROR',
      },
      500
    );
  }
});

// GET /api/logs/stats/overview - 获取统计概览
logsRoutes.get('/stats/overview', async (c) => {
  try {
    const db = getDatabase();
    const query = c.req.query();

    // 时间范围筛选
    const conditions = [];
    if (query.startDate) {
      conditions.push(gte(requestLogs.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      conditions.push(lte(requestLogs.createdAt, new Date(query.endDate)));
    }

    // 总体统计
    const overviewQuery =
      conditions.length > 0
        ? db
            .select({
              totalRequests: sql<number>`count(*)`,
              successRequests: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`,
              failureRequests: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`,
              avgLatency: sql<number>`avg(${requestLogs.latencyMs})`,
              totalInputTokens: sql<number>`sum(${requestLogs.inputTokens})`,
              totalOutputTokens: sql<number>`sum(${requestLogs.outputTokens})`,
              totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
            })
            .from(requestLogs)
            .where(and(...conditions))
        : db
            .select({
              totalRequests: sql<number>`count(*)`,
              successRequests: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`,
              failureRequests: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`,
              avgLatency: sql<number>`avg(${requestLogs.latencyMs})`,
              totalInputTokens: sql<number>`sum(${requestLogs.inputTokens})`,
              totalOutputTokens: sql<number>`sum(${requestLogs.outputTokens})`,
              totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
            })
            .from(requestLogs);

    const overview = await overviewQuery;

    // 按模型统计
    const modelStatsQuery =
      conditions.length > 0
        ? db
            .select({
              modelName: requestLogs.modelName,
              requestCount: sql<number>`count(*)`,
              avgLatency: sql<number>`avg(${requestLogs.latencyMs})`,
              totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
            })
            .from(requestLogs)
            .where(and(...conditions))
            .groupBy(requestLogs.modelName)
        : db
            .select({
              modelName: requestLogs.modelName,
              requestCount: sql<number>`count(*)`,
              avgLatency: sql<number>`avg(${requestLogs.latencyMs})`,
              totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
            })
            .from(requestLogs)
            .groupBy(requestLogs.modelName);

    const modelStats = await modelStatsQuery;

    // 按虚拟密钥统计
    const keyStatsQuery =
      conditions.length > 0
        ? db
            .select({
              virtualKeyId: requestLogs.virtualKeyId,
              virtualKeyName: requestLogs.virtualKeyName,
              requestCount: sql<number>`count(*)`,
              totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
            })
            .from(requestLogs)
            .where(and(...conditions, isNotNull(requestLogs.virtualKeyId)))
            .groupBy(requestLogs.virtualKeyId, requestLogs.virtualKeyName)
        : db
            .select({
              virtualKeyId: requestLogs.virtualKeyId,
              virtualKeyName: requestLogs.virtualKeyName,
              requestCount: sql<number>`count(*)`,
              totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
            })
            .from(requestLogs)
            .where(isNotNull(requestLogs.virtualKeyId))
            .groupBy(requestLogs.virtualKeyId, requestLogs.virtualKeyName);

    const keyStats = await keyStatsQuery;

    // 按客户端类型统计（top 10）
    const clientStatsQuery =
      conditions.length > 0
        ? db
            .select({
              clientType: requestLogs.clientType,
              requestCount: sql<number>`count(*)`,
            })
            .from(requestLogs)
            .where(and(...conditions))
            .groupBy(requestLogs.clientType)
            .orderBy(desc(sql`count(*)`))
            .limit(10)
        : db
            .select({
              clientType: requestLogs.clientType,
              requestCount: sql<number>`count(*)`,
            })
            .from(requestLogs)
            .groupBy(requestLogs.clientType)
            .orderBy(desc(sql`count(*)`))
            .limit(10);

    const clientStats = await clientStatsQuery;

    return c.json({
      success: true,
      data: {
        overview: {
          totalRequests: Number(overview[0]?.totalRequests || 0),
          successRequests: Number(overview[0]?.successRequests || 0),
          failureRequests: Number(overview[0]?.failureRequests || 0),
          avgLatency: Number(overview[0]?.avgLatency || 0),
          totalInputTokens: Number(overview[0]?.totalInputTokens || 0),
          totalOutputTokens: Number(overview[0]?.totalOutputTokens || 0),
          totalTokens: Number(overview[0]?.totalTokens || 0),
        },
        modelStats: modelStats.map((stat) => ({
          modelName: stat.modelName,
          requestCount: Number(stat.requestCount),
          avgLatency: Number(stat.avgLatency),
          totalTokens: Number(stat.totalTokens),
        })),
        keyStats: keyStats.map((stat) => ({
          virtualKeyId: stat.virtualKeyId || '',
          virtualKeyName: stat.virtualKeyName || '',
          requestCount: Number(stat.requestCount),
          totalTokens: Number(stat.totalTokens),
        })),
        clientStats: clientStats.map((stat) => ({
          clientType: stat.clientType,
          requestCount: Number(stat.requestCount),
        })),
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get log stats');
    return c.json(
      {
        error: 'Failed to get log stats',
        code: 'LOG_STATS_ERROR',
      },
      500
    );
  }
});

// GET /api/logs/stats/storage - 获取存储统计
logsRoutes.get('/stats/storage', async (c) => {
  try {
    const db = getDatabase();
    const retentionDays = 30; // 默认保留天数

    // 总数统计
    const countResult = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(requestLogs);

    const totalCount = Number(countResult[0]?.count || 0);

    // 最早和最新日志时间
    const dateRangeResult = await db
      .select({
        oldest: sql<string>`min(${requestLogs.createdAt})`,
        newest: sql<string>`max(${requestLogs.createdAt})`,
      })
      .from(requestLogs);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // 估算过期日志数
    const expiredCountResult = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(requestLogs)
      .where(lt(requestLogs.createdAt, cutoffDate));

    return c.json({
      success: true,
      data: {
        totalCount,
        oldestLogDate: dateRangeResult[0]?.oldest || null,
        newestLogDate: dateRangeResult[0]?.newest || null,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        estimatedExpiredLogs: String(expiredCountResult[0]?.count || 0),
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get storage stats');
    return c.json(
      {
        error: 'Failed to get storage stats',
        code: 'STORAGE_STATS_ERROR',
      },
      500
    );
  }
});
// POST /api/logs/cleanup - 手动清理过期日志
logsRoutes.post('/cleanup', async (c) => {
  try {
    const body = await c.req.json();
    const retentionDays = body.retentionDays || 30;

    const db = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleteResult = await db
      .delete(requestLogs)
      .where(lt(requestLogs.createdAt, cutoffDate))
      .returning({ id: requestLogs.id });

    const deletedCount = deleteResult.length;

    logger.info({ deletedCount, retentionDays }, 'Logs cleaned up');

    return c.json({
      success: true,
      data: {
        deletedCount,
        retentionDays,
      },
      message: `Deleted ${deletedCount} expired logs`,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to cleanup logs');
    return c.json(
      {
        error: 'Failed to cleanup logs',
        code: 'LOG_CLEANUP_ERROR',
      },
      500
    );
  }
});

// GET /api/logs/stats/keys - 所有 API Key 的用量统计
logsRoutes.get('/stats/keys', async (c) => {
  try {
    const db = getDatabase();
    const period = c.req.query('period') ?? 'all';

    const conditions: ReturnType<typeof isNotNull>[] = [isNotNull(requestLogs.virtualKeyId)];

    if (period !== 'all') {
      const now = new Date();
      let periodStart: Date;
      if (period === 'today') {
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === '7d') {
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        // 30d
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      conditions.push(gte(requestLogs.createdAt, periodStart) as unknown as ReturnType<typeof isNotNull>);
    }

    const rows = await db
      .select({
        virtualKeyId: requestLogs.virtualKeyId,
        virtualKeyName: requestLogs.virtualKeyName,
        requestCount: sql<number>`count(*)`,
        successCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`,
        failureCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`,
        totalInputTokens: sql<number>`coalesce(sum(${requestLogs.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(${requestLogs.outputTokens}), 0)`,
        totalTokens: sql<number>`coalesce(sum(${requestLogs.totalTokens}), 0)`,
        avgLatencyMs: sql<number>`round(avg(${requestLogs.latencyMs}))`,
        lastUsedAt: sql<string>`max(${requestLogs.createdAt})`,
      })
      .from(requestLogs)
      .where(and(...conditions))
      .groupBy(requestLogs.virtualKeyId, requestLogs.virtualKeyName);

    return c.json({
      success: true,
      data: rows.map((r) => ({
        virtualKeyId: r.virtualKeyId,
        virtualKeyName: r.virtualKeyName,
        requestCount: Number(r.requestCount),
        successCount: Number(r.successCount),
        failureCount: Number(r.failureCount),
        totalInputTokens: Number(r.totalInputTokens),
        totalOutputTokens: Number(r.totalOutputTokens),
        totalTokens: Number(r.totalTokens),
        avgLatencyMs: Number(r.avgLatencyMs),
        lastUsedAt: r.lastUsedAt ?? null,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch key stats');
    return c.json({ success: false, error: 'Failed to fetch key stats' }, 500);
  }
});

// GET /api/logs/stats/providers - 供应商网络质量统计
logsRoutes.get('/stats/providers', async (c) => {
  try {
    const db = getDatabase();
    const query = c.req.query();

    const conditions = [isNotNull(requestLogs.providerId)];

    if (query.startDate) {
      conditions.push(gte(requestLogs.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      conditions.push(lte(requestLogs.createdAt, new Date(query.endDate)));
    }

    const ttfbExpr = sql`(${requestLogs.metadata}->'performance'->>'providerTtfbMs')::numeric`;

    const results = await db
      .select({
        providerId: requestLogs.providerId,
        providerName: requestLogs.providerName,
        totalRequests: sql<number>`count(*)`.mapWith(Number),
        successCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`.mapWith(Number),
        failureCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`.mapWith(Number),
        avgLatency: sql<number>`round(avg(${requestLogs.latencyMs}))`.mapWith(Number),
        minLatency: sql<number>`min(${requestLogs.latencyMs})`.mapWith(Number),
        maxLatency: sql<number>`max(${requestLogs.latencyMs})`.mapWith(Number),
        p95Latency: sql<number>`round(percentile_cont(0.95) within group (order by ${requestLogs.latencyMs}))`.mapWith(Number),
        avgTtfb: sql<number | null>`round(avg(${ttfbExpr}))`.mapWith(Number),
        p95Ttfb: sql<number | null>`round(percentile_cont(0.95) within group (order by ${ttfbExpr}))`.mapWith(Number),
        ttfbCount: sql<number>`count(*) filter (where ${ttfbExpr} is not null)`.mapWith(Number),
        lastRequestAt: sql<string>`max(${requestLogs.createdAt})`,
      })
      .from(requestLogs)
      .where(and(...conditions))
      .groupBy(requestLogs.providerId, requestLogs.providerName)
      .orderBy(sql`avg(${requestLogs.latencyMs}) asc nulls last`);

    return c.json({ success: true, data: results });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get provider stats');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// POST /api/logs/:id/analyze - AI 对话分析
logsRoutes.post('/:id/analyze', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { indices?: number[] };
  const db = getDatabase();

  // 1. 获取日志消息
  const logResult = await db
    .select({
      standardRequestBody: requestLogs.standardRequestBody,
      requestBody: requestLogs.requestBody,
    })
    .from(requestLogs)
    .where(eq(requestLogs.id, id))
    .limit(1);

  if (logResult.length === 0) {
    return c.json({ error: 'Log not found' }, 404);
  }

  const logData = logResult[0];
  const rawMessages =
    (logData.standardRequestBody as Record<string, unknown> | null)?.messages ??
    (logData.requestBody as Record<string, unknown> | null)?.messages;

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return c.json({ error: 'No messages in this log' }, 400);
  }

  type RawMessage = { role: string; content: unknown };
  let messages = rawMessages as RawMessage[];
  if (body.indices && body.indices.length > 0) {
    messages = body.indices.map((i) => messages[i]).filter(Boolean);
  }

  // 2. 获取 AI 模型配置
  let aiModel: Awaited<ReturnType<typeof getAiModel>>;
  try {
    aiModel = await getAiModel();
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return c.json({ error: err.message }, 503);
    }
    throw err;
  }

  const { actualModelName, apiKey, baseUrl } = aiModel;

  // 3. 将消息格式化为可读文本
  const formatContent = (content: unknown): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (typeof block !== 'object' || block === null) return '';
          if ('text' in block) return String((block as { text: unknown }).text);
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    return JSON.stringify(content);
  };

  const conversationText = messages
    .map((m) => `[${m.role.toUpperCase()}]:\n${formatContent(m.content)}`)
    .join('\n\n');

  const analysisMessages = [
    {
      role: 'system',
      content:
        '你是一个专业的 AI 对话分析师。请用中文简洁地分析用户提供的对话内容，输出结构清晰、重点突出的分析报告。',
    },
    {
      role: 'user',
      content: `请对以下 AI 对话请求进行分析，包含：\n1. **对话目的**：这段对话的主要意图\n2. **内容摘要**：核心信息提取\n3. **质量评估**：清晰度、上下文完整性等\n4. **工具使用**（如有）：工具调用情况分析\n5. **优化建议**（如有明显问题）\n\n保持简洁，每项不超过 2-3 句话。\n\n---\n${conversationText}\n---`,
    },
  ];

  // 4. 流式调用 Provider
  return stream(c, async (s) => {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: actualModelName,
          messages: analysisMessages,
          stream: true,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.warn({ status: response.status, body: errText }, 'Analysis provider error');
        await s.write(
          new TextEncoder().encode(
            `data: {"error":"Provider returned ${response.status}"}\n\ndata: [DONE]\n\n`
          )
        );
        return;
      }

      const reader = response.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await s.write(value);
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to stream analysis');
      await s.write(
        new TextEncoder().encode(`data: {"error":"Analysis request failed"}\n\ndata: [DONE]\n\n`)
      );
    }
  });
});

export default logsRoutes;
