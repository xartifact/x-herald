/**
 * 路由规则引擎
 * 按优先级匹配规则，执行条件判断
 */

import { eq, and, asc } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import { modelRoutes } from '@/features/model-groups/db';
import type { RouteCondition, ModelRoute } from '@/features/model-groups/db';

// 规则匹配上下文
export interface RouteContext {
  model: string;
  apiKeyName?: string;
  streaming: boolean;
  hour?: number;
  clientType?: string;
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
          eq(modelRoutes.virtualModelId, virtualModelId),
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
      default:
        return undefined;
    }
  }

  /**
   * 评估操作符
   */
  private evaluateOperator(operator: string, fieldValue: unknown, condValue: unknown): boolean {
    switch (operator) {
      case 'eq':
        return fieldValue === condValue;
      case 'ne':
        return fieldValue !== condValue;
      case 'in':
        return Array.isArray(condValue) && condValue.includes(fieldValue);
      case 'starts_with':
        return typeof fieldValue === 'string' && typeof condValue === 'string' && fieldValue.startsWith(condValue);
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      default:
        return false;
    }
  }
}

export const routeRuleEngine = new RouteRuleEngine();
