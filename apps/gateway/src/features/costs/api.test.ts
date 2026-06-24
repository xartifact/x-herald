import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

import {
  setupCrudTest,
  teardownCrudTest,
  parseJson,
  authGet,
  authPut,
  unauthGet,
} from '../../test/crud-helper';
import { testRequest } from '../../test/hono-helper';

import type { CrudTestContext } from '../../test/crud-helper';

let ctx: CrudTestContext;

interface CostSummary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  requestCount: number;
}

interface PricingEntry {
  inputPer1k: number;
  outputPer1k: number;
}

describe('costs API', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest();
  });

  afterAll(async () => {
    await teardownCrudTest();
  });

  describe('GET /api/costs/summary', () => {
    it('returns 401 without auth token', async () => {
      const res = await unauthGet(ctx, '/api/costs/summary');
      expect(res.status).toBe(401);
    });

    it('returns 200 with zero-valued summary on empty database', async () => {
      const res = await authGet(ctx, '/api/costs/summary');
      expect(res.status).toBe(200);

      const { body } = await parseJson<CostSummary>(res);
      expect(body.success).toBe(true);
      expect(body.data.totalCost).toBe(0);
      expect(body.data.totalInputTokens).toBe(0);
      expect(body.data.totalOutputTokens).toBe(0);
      expect(body.data.requestCount).toBe(0);
    });

    it('accepts startDate and endDate query parameters', async () => {
      const start = '2025-01-01';
      const end = '2025-12-31';
      const res = await authGet(ctx, `/api/costs/summary?startDate=${start}&endDate=${end}`);
      expect(res.status).toBe(200);

      const { body } = await parseJson<CostSummary>(res);
      expect(body.success).toBe(true);
      expect(body.data.requestCount).toBe(0);
    });

    it('accepts keyId query parameter', async () => {
      const res = await authGet(ctx, '/api/costs/summary?keyId=test-key-id');
      expect(res.status).toBe(200);
      const { body } = await parseJson<CostSummary>(res);
      expect(body.success).toBe(true);
    });

    it('accepts providerName query parameter', async () => {
      const res = await authGet(ctx, '/api/costs/summary?providerName=openai');
      expect(res.status).toBe(200);
      const { body } = await parseJson<CostSummary>(res);
      expect(body.success).toBe(true);
    });

    it('accepts modelName query parameter', async () => {
      const res = await authGet(ctx, '/api/costs/summary?modelName=gpt-4o');
      expect(res.status).toBe(200);
      const { body } = await parseJson<CostSummary>(res);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/costs/by-key', () => {
    it('returns 401 without auth token', async () => {
      const res = await unauthGet(ctx, '/api/costs/by-key');
      expect(res.status).toBe(401);
    });

    it('returns 200 with empty array on empty database', async () => {
      const res = await authGet(ctx, '/api/costs/by-key');
      expect(res.status).toBe(200);

      const { body } = await parseJson<{
        success: boolean;
        data: { name: string; totalCost: number; requestCount: number }[];
      }>(res);

      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(0);
    });
  });

  describe('GET /api/costs/by-provider', () => {
    it('returns 401 without auth token', async () => {
      const res = await unauthGet(ctx, '/api/costs/by-provider');
      expect(res.status).toBe(401);
    });

    it('returns 200 with empty array on empty database', async () => {
      const res = await authGet(ctx, '/api/costs/by-provider');
      expect(res.status).toBe(200);

      const { body } = await parseJson<{
        success: boolean;
        data: { name: string; totalCost: number; requestCount: number }[];
      }>(res);

      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(0);
    });
  });

  describe('GET /api/costs/by-model', () => {
    it('returns 401 without auth token', async () => {
      const res = await unauthGet(ctx, '/api/costs/by-model');
      expect(res.status).toBe(401);
    });

    it('returns 200 with empty array on empty database', async () => {
      const res = await authGet(ctx, '/api/costs/by-model');
      expect(res.status).toBe(200);

      const { body } = await parseJson<{
        success: boolean;
        data: { name: string; totalCost: number; requestCount: number }[];
      }>(res);

      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(0);
    });
  });

  describe('GET /api/costs/pricing', () => {
    it('returns 401 without auth token', async () => {
      const res = await unauthGet(ctx, '/api/costs/pricing');
      expect(res.status).toBe(401);
    });

    it('returns 200 with default pricing for openai, anthropic, gemini', async () => {
      const res = await authGet(ctx, '/api/costs/pricing');
      expect(res.status).toBe(200);

      const { body } = await parseJson<Record<string, PricingEntry>>(res);

      expect(body.success).toBe(true);
      expect(body.data.openai).toBeDefined();
      expect(body.data.openai.inputPer1k).toBe(0.005);
      expect(body.data.openai.outputPer1k).toBe(0.015);

      expect(body.data.anthropic).toBeDefined();
      expect(body.data.anthropic.inputPer1k).toBe(0.003);
      expect(body.data.anthropic.outputPer1k).toBe(0.015);

      expect(body.data.gemini).toBeDefined();
      expect(body.data.gemini.inputPer1k).toBe(0.00125);
      expect(body.data.gemini.outputPer1k).toBe(0.005);
    });
  });

  describe('PUT /api/costs/pricing', () => {
    it('returns 401 without auth token', async () => {
      const res = await testRequest(ctx.app, 'PUT', '/api/costs/pricing', {
        body: { provider: 'test-provider', inputPer1k: 0.01, outputPer1k: 0.02 },
      });
      expect(res.status).toBe(401);
    });

    it('returns 200 with success and message for valid pricing update', async () => {
      const res = await authPut(ctx, '/api/costs/pricing', {
        provider: 'test-provider',
        inputPer1k: 0.01,
        outputPer1k: 0.02,
      });
      expect(res.status).toBe(200);

      const body = await res.json() as { success: boolean; message: string };
      expect(body.success).toBe(true);
      expect(body.message).toBe('Pricing updated');
    });

    it('returns 400 when provider is missing', async () => {
      const res = await authPut(ctx, '/api/costs/pricing', {
        inputPer1k: 0.01,
        outputPer1k: 0.02,
      });
      expect(res.status).toBe(400);

      const { body } = await parseJson<{ error: string; code: string }>(res);
      expect(body.error).toBe('Invalid pricing parameters');
      expect(body.code).toBe('INVALID_PRICING_PARAMS');
    });

    it('returns 400 when inputPer1k is missing', async () => {
      const res = await authPut(ctx, '/api/costs/pricing', {
        provider: 'test-provider',
        outputPer1k: 0.02,
      });
      expect(res.status).toBe(400);

      const { body } = await parseJson<{ error: string; code: string }>(res);
      expect(body.error).toBe('Invalid pricing parameters');
      expect(body.code).toBe('INVALID_PRICING_PARAMS');
    });

    it('returns 400 when outputPer1k is missing', async () => {
      const res = await authPut(ctx, '/api/costs/pricing', {
        provider: 'test-provider',
        inputPer1k: 0.01,
      });
      expect(res.status).toBe(400);

      const { body } = await parseJson<{ error: string; code: string }>(res);
      expect(body.error).toBe('Invalid pricing parameters');
      expect(body.code).toBe('INVALID_PRICING_PARAMS');
    });

    it('returns 400 when inputPer1k is not a number', async () => {
      const res = await authPut(ctx, '/api/costs/pricing', {
        provider: 'test-provider',
        inputPer1k: 'free',
        outputPer1k: 0.02,
      });
      expect(res.status).toBe(400);

      const { body } = await parseJson<{ error: string; code: string }>(res);
      expect(body.code).toBe('INVALID_PRICING_PARAMS');
    });

    it('returns 400 when all fields are missing', async () => {
      const res = await authPut(ctx, '/api/costs/pricing', {});
      expect(res.status).toBe(400);

      const { body } = await parseJson<{ error: string; code: string }>(res);
      expect(body.code).toBe('INVALID_PRICING_PARAMS');
    });

    it('after PUT, GET /api/costs/pricing includes the new provider', async () => {
      const putRes = await authPut(ctx, '/api/costs/pricing', {
        provider: 'new-llm-provider',
        inputPer1k: 0.025,
        outputPer1k: 0.05,
      });
      expect(putRes.status).toBe(200);

      const getRes = await authGet(ctx, '/api/costs/pricing');
      expect(getRes.status).toBe(200);

      const { body } = await parseJson<Record<string, PricingEntry>>(getRes);
      expect(body.data['new-llm-provider']).toBeDefined();
      expect(body.data['new-llm-provider'].inputPer1k).toBe(0.025);
      expect(body.data['new-llm-provider'].outputPer1k).toBe(0.05);
    });

    it('can override existing provider pricing', async () => {
      const putRes = await authPut(ctx, '/api/costs/pricing', {
        provider: 'openai',
        inputPer1k: 0.999,
        outputPer1k: 0.888,
      });
      expect(putRes.status).toBe(200);

      const getRes = await authGet(ctx, '/api/costs/pricing');
      expect(getRes.status).toBe(200);

      const { body } = await parseJson<Record<string, PricingEntry>>(getRes);
      expect(body.data.openai.inputPer1k).toBe(0.999);
      expect(body.data.openai.outputPer1k).toBe(0.888);
    });
  });
});
