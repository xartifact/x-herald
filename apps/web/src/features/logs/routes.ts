import { Hono } from 'hono';
import { eq, and, gte, lte, sql, desc, lt, isNotNull } from 'drizzle-orm';
import { getDatabase } from '@/core/db/client';
import { requestLogs } from './db';
import { authMiddleware } from '../auth/middleware';
import logger from '@/core/lib/logger';

const logsRoutes = new Hono();

// 所有路由都需要认证
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
    logger.error({ error }, 'Failed to list logs');
    return c.json(
      {
        error: 'Failed to list logs',
        code: 'LOGS_LIST_ERROR',
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
    logger.error({ error }, 'Failed to get log');
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
    logger.error({ error }, 'Failed to delete log');
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
    logger.error({ error }, 'Failed to get log stats');
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
    logger.error({ error }, 'Failed to get storage stats');
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
    logger.error({ error }, 'Failed to cleanup logs');
    return c.json(
      {
        error: 'Failed to cleanup logs',
        code: 'LOG_CLEANUP_ERROR',
      },
      500
    );
  }
});

export default logsRoutes;
