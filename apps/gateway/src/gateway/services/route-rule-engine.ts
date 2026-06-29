/**
 * 路由规则引擎
 * 按优先级匹配规则，执行条件判断
 */

import { eq, and, asc, sql } from 'drizzle-orm';

import { getDatabase } from '../../db/client';
import logger from '../../lib/logger';
import { modelRoutes, type ModelRoute } from '@xartifact/x-llm-gateway-db';
import type { RouteCondition } from '../../features/model-groups/db';

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

export function evaluateConditions(conditions: RouteCondition[], ctx: RouteContext): boolean {
  if (conditions.length === 0) return true;

  return conditions.every((cond) => {
    const fieldValue = getField(cond.field, ctx);
    return evaluateOperator(cond.operator, fieldValue, cond.value);
  });
}

export function getField(field: string, ctx: RouteContext): unknown {
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

export function coerceValue(fieldValue: unknown, condValue: unknown): unknown {
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

export function evaluateOperator(operator: string, fieldValue: unknown, condValue: unknown): boolean {
  const coerced = coerceValue(fieldValue, condValue);
  switch (operator) {
    case 'eq':
      return fieldValue === coerced;
    case 'ne':
      return fieldValue !== coerced;
    case 'in': {
      const list = Array.isArray(condValue)
        ? condValue
        : typeof condValue === 'string'
          ? condValue.split(',').map((v) => v.trim())
          : [];
      return list.some((v) => fieldValue === coerceValue(fieldValue, v));
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

/**
 * 路由规则引擎
 */
export class RouteRuleEngine {
  async match(virtualModelId: string | null, context: RouteContext): Promise<ModelRoute | null> {
    const db = getDatabase();

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
      if (evaluateConditions(rule.conditions || [], context)) {
        logger.info(
          { ruleId: rule.id, ruleName: rule.name, model: context.model },
          'Route rule matched'
        );
        return rule;
      }
    }

    return null;
  }
}

export const routeRuleEngine = new RouteRuleEngine();
