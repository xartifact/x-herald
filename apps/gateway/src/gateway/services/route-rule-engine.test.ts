import { describe, it, expect } from 'bun:test'
import { evaluateConditions, evaluateOperator, coerceValue, getField } from './route-rule-engine'
import type { RouteContext, PerfContext } from './route-rule-engine'
import type { RouteCondition } from '@xartifact/x-herald-shared'

function makePerf(overrides: Partial<PerfContext> = {}): PerfContext {
  return {
    worstAnomalyLevel: 'normal',
    maxAnomalyScore: 0.5,
    minSuccessRate: 0.95,
    maxTtfbP95: 1200,
    healthyRatio: 1.0,
    ...overrides,
  }
}

describe('evaluateConditions', () => {
  it('returns true for empty conditions array', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    expect(evaluateConditions([], ctx)).toBe(true)
  })

  it('returns true when single condition is true', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    const cond: RouteCondition = { field: 'request.model', operator: 'eq', value: 'gpt-4' }
    expect(evaluateConditions([cond], ctx)).toBe(true)
  })

  it('returns false when single condition is false', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    const cond: RouteCondition = { field: 'request.model', operator: 'eq', value: 'gpt-3' }
    expect(evaluateConditions([cond], ctx)).toBe(false)
  })

  it('returns true when all multiple conditions are true (AND semantics)', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: true }
    const conds: RouteCondition[] = [
      { field: 'request.model', operator: 'eq', value: 'gpt-4' },
      { field: 'context.streaming', operator: 'eq', value: true },
    ]
    expect(evaluateConditions(conds, ctx)).toBe(true)
  })

  it('returns false when one of multiple conditions is false (AND semantics)', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    const conds: RouteCondition[] = [
      { field: 'request.model', operator: 'eq', value: 'gpt-4' },
      { field: 'context.streaming', operator: 'eq', value: true },
    ]
    expect(evaluateConditions(conds, ctx)).toBe(false)
  })

  it('returns false when all multiple conditions are false', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    const conds: RouteCondition[] = [
      { field: 'request.model', operator: 'eq', value: 'gpt-3' },
      { field: 'context.streaming', operator: 'eq', value: true },
    ]
    expect(evaluateConditions(conds, ctx)).toBe(false)
  })
})

describe('evaluateOperator', () => {
  describe('eq operator', () => {
    it('matches when string values are equal', () => {
      expect(evaluateOperator('eq', 'gpt-4', 'gpt-4')).toBe(true)
    })

    it('does not match when string values differ', () => {
      expect(evaluateOperator('eq', 'gpt-4', 'gpt-3')).toBe(false)
    })

    it('matches when number values are equal', () => {
      expect(evaluateOperator('eq', 10, '10')).toBe(true)
    })

    it('matches when boolean values are equal', () => {
      expect(evaluateOperator('eq', true, 'true')).toBe(true)
    })
  })

  describe('ne operator', () => {
    it('returns true when string values are not equal', () => {
      expect(evaluateOperator('ne', 'gpt-4', 'gpt-3')).toBe(true)
    })

    it('returns false when values are the same', () => {
      expect(evaluateOperator('ne', 'gpt-4', 'gpt-4')).toBe(false)
    })

    it('returns true when number values are not equal', () => {
      expect(evaluateOperator('ne', 10, '5')).toBe(true)
    })
  })

  describe('in operator', () => {
    it('matches when field value is in array', () => {
      expect(evaluateOperator('in', 'gpt-4', ['gpt-3', 'gpt-4'])).toBe(true)
    })

    it('does not match when field value is not in array', () => {
      expect(evaluateOperator('in', 'gpt-4', ['gpt-3', 'gpt-3.5'])).toBe(false)
    })

    it('matches when field value is in comma-separated string', () => {
      expect(evaluateOperator('in', 'gpt-4', 'gpt-3, gpt-4')).toBe(true)
    })

    it('does not match when field value is not in comma-separated string', () => {
      expect(evaluateOperator('in', 'gpt-4', 'gpt-3, gpt-3.5')).toBe(false)
    })

    it('matches with number coercion from string list', () => {
      expect(evaluateOperator('in', 10, '5, 10, 15')).toBe(true)
    })
  })

  describe('starts_with operator', () => {
    it('matches when string starts with prefix', () => {
      expect(evaluateOperator('starts_with', 'gpt-4-turbo', 'gpt-4')).toBe(true)
    })

    it('does not match when string does not start with prefix', () => {
      expect(evaluateOperator('starts_with', 'claude-3', 'gpt-4')).toBe(false)
    })

    it('returns false for non-string field value', () => {
      expect(evaluateOperator('starts_with', 123, '12')).toBe(false)
    })
  })

  describe('exists operator', () => {
    it('returns true when value is defined and not null', () => {
      expect(evaluateOperator('exists', 'value', undefined)).toBe(true)
    })

    it('returns false when value is undefined', () => {
      expect(evaluateOperator('exists', undefined, undefined)).toBe(false)
    })

    it('returns false when value is null', () => {
      expect(evaluateOperator('exists', null, undefined)).toBe(false)
    })

    it('returns true for empty string (falsy but defined)', () => {
      expect(evaluateOperator('exists', '', undefined)).toBe(true)
    })
  })

  describe('gt operator', () => {
    it('returns true when field value is greater than condition value', () => {
      expect(evaluateOperator('gt', 10, '5')).toBe(true)
    })

    it('returns false when values are equal', () => {
      expect(evaluateOperator('gt', 10, '10')).toBe(false)
    })

    it('returns false when field value is less than condition value', () => {
      expect(evaluateOperator('gt', 5, '10')).toBe(false)
    })

    it('returns false for non-number field value', () => {
      expect(evaluateOperator('gt', '10', '5')).toBe(false)
    })
  })

  describe('lt operator', () => {
    it('returns true when field value is less than condition value', () => {
      expect(evaluateOperator('lt', 5, '10')).toBe(true)
    })

    it('returns false when values are equal', () => {
      expect(evaluateOperator('lt', 10, '10')).toBe(false)
    })

    it('returns false when field value is greater than condition value', () => {
      expect(evaluateOperator('lt', 15, '10')).toBe(false)
    })

    it('returns false for non-number field value', () => {
      expect(evaluateOperator('lt', '5', '10')).toBe(false)
    })
  })

  describe('gte operator', () => {
    it('returns true when field value is greater than condition value', () => {
      expect(evaluateOperator('gte', 15, '10')).toBe(true)
    })

    it('returns true when values are equal', () => {
      expect(evaluateOperator('gte', 10, '10')).toBe(true)
    })

    it('returns false when field value is less than condition value', () => {
      expect(evaluateOperator('gte', 5, '10')).toBe(false)
    })
  })

  describe('lte operator', () => {
    it('returns true when field value is less than condition value', () => {
      expect(evaluateOperator('lte', 5, '10')).toBe(true)
    })

    it('returns true when values are equal', () => {
      expect(evaluateOperator('lte', 10, '10')).toBe(true)
    })

    it('returns false when field value is greater than condition value', () => {
      expect(evaluateOperator('lte', 15, '10')).toBe(false)
    })
  })

  describe('unknown operator', () => {
    it('returns false for unknown operator', () => {
      expect(evaluateOperator('unknown_op', 'value', 'value')).toBe(false)
    })
  })
})

describe('coerceValue', () => {
  it('coerces string "123" to number 123 when fieldValue is number', () => {
    expect(coerceValue(0, '123')).toBe(123)
  })

  it('coerces string "42.5" to number 42.5 when fieldValue is number', () => {
    expect(coerceValue(0, '42.5')).toBe(42.5)
  })

  it('keeps string "abc" when fieldValue is number (NaN fallback)', () => {
    expect(coerceValue(0, 'abc')).toBe('abc')
  })

  it('coerces string "true" to boolean true when fieldValue is boolean', () => {
    expect(coerceValue(true, 'true')).toBe(true)
  })

  it('coerces string "false" to boolean false when fieldValue is boolean', () => {
    expect(coerceValue(false, 'false')).toBe(false)
  })

  it('passes through same types without coercion', () => {
    expect(coerceValue('hello', 'world')).toBe('world')
    expect(coerceValue(10, 20)).toBe(20)
    expect(coerceValue(true, false)).toBe(false)
  })
})

describe('getField', () => {
  it('returns context.model for request.model', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    expect(getField('request.model', ctx)).toBe('gpt-4')
  })

  it('returns context.apiKeyName for context.apiKeyName', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false, apiKeyName: 'my-key' }
    expect(getField('context.apiKeyName', ctx)).toBe('my-key')
  })

  it('returns context.streaming for context.streaming', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: true }
    expect(getField('context.streaming', ctx)).toBe(true)
  })

  it('returns context.hour when defined', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false, hour: 14 }
    expect(getField('context.hour', ctx)).toBe(14)
  })

  it('returns current hour when context.hour is undefined', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    const currentHour = new Date().getHours()
    expect(getField('context.hour', ctx)).toBe(currentHour)
  })

  it('returns context.clientType for context.clientType', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false, clientType: 'web' }
    expect(getField('context.clientType', ctx)).toBe('web')
  })

  it('returns perf.worstAnomalyLevel for perf.anomalyLevel', () => {
    const ctx: RouteContext = {
      model: 'gpt-4',
      streaming: false,
      perf: makePerf({ worstAnomalyLevel: 'critical' }),
    }
    expect(getField('perf.anomalyLevel', ctx)).toBe('critical')
  })

  it('returns "unknown" for perf.anomalyLevel when perf is undefined', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    expect(getField('perf.anomalyLevel', ctx)).toBe('unknown')
  })

  it('returns perf.maxAnomalyScore for perf.anomalyScore', () => {
    const ctx: RouteContext = {
      model: 'gpt-4',
      streaming: false,
      perf: makePerf({ maxAnomalyScore: 0.8 }),
    }
    expect(getField('perf.anomalyScore', ctx)).toBe(0.8)
  })

  it('returns null for perf.anomalyScore when perf is undefined', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    expect(getField('perf.anomalyScore', ctx)).toBeNull()
  })

  it('returns perf.minSuccessRate for perf.successRate', () => {
    const ctx: RouteContext = {
      model: 'gpt-4',
      streaming: false,
      perf: makePerf({ minSuccessRate: 0.99 }),
    }
    expect(getField('perf.successRate', ctx)).toBe(0.99)
  })

  it('returns null for perf.successRate when perf is undefined', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    expect(getField('perf.successRate', ctx)).toBeNull()
  })

  it('returns perf.maxTtfbP95 for perf.ttfbP95', () => {
    const ctx: RouteContext = {
      model: 'gpt-4',
      streaming: false,
      perf: makePerf({ maxTtfbP95: 2000 }),
    }
    expect(getField('perf.ttfbP95', ctx)).toBe(2000)
  })

  it('returns null for perf.ttfbP95 when perf is undefined', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    expect(getField('perf.ttfbP95', ctx)).toBeNull()
  })

  it('returns perf.healthyRatio for perf.healthyRatio', () => {
    const ctx: RouteContext = {
      model: 'gpt-4',
      streaming: false,
      perf: makePerf({ healthyRatio: 0.75 }),
    }
    expect(getField('perf.healthyRatio', ctx)).toBe(0.75)
  })

  it('returns 1 for perf.healthyRatio when perf is undefined', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    expect(getField('perf.healthyRatio', ctx)).toBe(1)
  })

  it('returns undefined for unknown field', () => {
    const ctx: RouteContext = { model: 'gpt-4', streaming: false }
    expect(getField('unknown.field', ctx)).toBeUndefined()
  })
})
