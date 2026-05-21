/**
 * 路由规则引擎
 * 按优先级匹配规则，执行条件判断
 */

import { eq, and, asc, sql } from 'drizzle-orm';

import { getDatabase } from '../../db/client';
import logger from '../../lib/logger';
import { modelRoutes } from '../../features/model-groups/db';
import type { RouteCondition, ModelRoute } from '../../features/model-groups/db';

// 性能上下文：聚合目标路由规则所有实例的最差健康状态
export interface PerfContext {
  worstAnomalyLevel: 'normal' | 'warning' | 'critical' | 'unknown';
  maxAnomalyScore: number | null;
  minSuccessRate: number | null;
  maxTtfbP95: number | null;
  healthyRatio: number;
}

// 规则匹配上下文
export interface RouteContext {
  model: string;
  apiKeyName?: string;
  streaming: boolean;
  hour?: number;
  clientType?: string;
  perf?: PerfContext;
}

/**
 * 路由规则引擎
 */
export class RouteRuleEngine {
  /**
   * 按优先级匹配规则，返回第一个匹配的规则
   */
  async match(virtualModelId: string | null, context: RouteContext): Promise<ModelRoute | null> {
    const db = getDatabase();

    // 查询启用的规则，按优先级排序
    const conditions = virtualModelId
      ? and(
          sql`${modelRoutes.accessModelIds} @> ARRAY[${virtualModelId}]::text[]`,
          eq(modelRoutes.enabled, true)
        )
      : eq(modelRoutes.enabled, true);

    const rules = await db
      .select()
      .from(modelRoutes)
      .where(conditions)
      .orderBy(asc(modelRoutes.priority));

    for (const rule of rules) {
      if (this.evaluateConditions(rule.conditions || [], context)) {
        logger.info(
          { ruleId: rule.id, ruleName: rule.name, model: context.model },
          'Route rule matched'
        );
        return rule;
      }
    }

    return null;
  }

  /**
   * 评估条件列表（AND 语义）
   */
  private evaluateConditions(conditions: RouteCondition[], ctx: RouteContext): boolean {
    if (conditions.length === 0) return true;

    return conditions.every((cond) => {
      const fieldValue = this.getField(cond.field, ctx);
      return this.evaluateOperator(cond.operator, fieldValue, cond.value);
    });
  }

  /**
   * 获取字段值
   */
  private getField(field: string, ctx: RouteContext): unknown {
    switch (field) {
      case 'request.model':
        return ctx.model;
      case 'context.apiKeyName':
        return ctx.apiKeyName;
      case 'context.streaming':
        return ctx.streaming;
      case 'context.hour':
        return ctx.hour ?? new Date().getHours();
      case 'context.clientType':
        return ctx.clientType;
      case 'perf.anomalyLevel':
        return ctx.perf?.worstAnomalyLevel ?? 'unknown';
      case 'perf.anomalyScore':
        return ctx.perf?.maxAnomalyScore ?? null;
      case 'perf.successRate':
        return ctx.perf?.minSuccessRate ?? null;
      case 'perf.ttfbP95':
        return ctx.perf?.maxTtfbP95 ?? null;
      case 'perf.healthyRatio':
        return ctx.perf?.healthyRatio ?? 1;
      default:
        return undefined;
    }
  }

  /**
   * 强制转换条件值到目标字段的类型，处理 UI 存储字符串但运行时为其他类型的情况
   */
  private coerceValue(fieldValue: unknown, condValue: unknown): unknown {
    if (typeof fieldValue === 'number' && typeof condValue === 'string') {
      const n = Number(condValue);
      return isNaN(n) ? condValue : n;
    }
    if (typeof fieldValue === 'boolean' && typeof condValue === 'string') {
      if (condValue === 'true') return true;
      if (condValue === 'false') return false;
    }
    return condValue;
  }

  /**
   * 评估操作符
   */
  private evaluateOperator(operator: string, fieldValue: unknown, condValue: unknown): boolean {
    const coerced = this.coerceValue(fieldValue, condValue);
    switch (operator) {
      case 'eq':
        return fieldValue === coerced;
      case 'ne':
        return fieldValue !== coerced;
      case 'in': {
        // 支持数组和逗号分隔字符串两种格式
        const list = Array.isArray(condValue)
          ? condValue
          : typeof condValue === 'string'
            ? condValue.split(',').map((v) => v.trim())
            : [];
        return list.some((v) => fieldValue === this.coerceValue(fieldValue, v));
      }
      case 'starts_with':
        return typeof fieldValue === 'string' && typeof condValue === 'string' && fieldValue.startsWith(condValue);
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      case 'gt':
        return typeof fieldValue === 'number' && fieldValue > Number(coerced);
      case 'lt':
        return typeof fieldValue === 'number' && fieldValue < Number(coerced);
      case 'gte':
        return typeof fieldValue === 'number' && fieldValue >= Number(coerced);
      case 'lte':
        return typeof fieldValue === 'number' && fieldValue <= Number(coerced);
      default:
        return false;
    }
  }
}

export const routeRuleEngine = new RouteRuleEngine();
