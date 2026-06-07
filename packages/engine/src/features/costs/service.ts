import { and, gte, lte, sql } from 'drizzle-orm';

import { getDatabase } from '../../db/client';
import logger from '../../lib/logger';
import { costRecords } from './db';

export interface ProviderPricing {
  inputPer1k: number;
  outputPer1k: number;
}

const DEFAULT_PRICING: Record<string, ProviderPricing> = {
  openai: { inputPer1k: 0.005, outputPer1k: 0.015 },
  anthropic: { inputPer1k: 0.003, outputPer1k: 0.015 },
  gemini: { inputPer1k: 0.00125, outputPer1k: 0.005 },
};

export class CostService {
  private pricing: Map<string, ProviderPricing>;

  constructor() {
    this.pricing = new Map(Object.entries(DEFAULT_PRICING));
  }

  setPricing(provider: string, pricing: ProviderPricing): void {
    this.pricing.set(provider, pricing);
  }

  getPricing(provider: string): ProviderPricing | undefined {
    return this.pricing.get(provider);
  }

  getAllPricing(): Map<string, ProviderPricing> {
    return new Map(this.pricing);
  }

  calculateCost(
    provider: string,
    inputTokens: number,
    outputTokens: number
  ): { inputCost: number; outputCost: number; totalCost: number } {
    const p = this.pricing.get(provider) || DEFAULT_PRICING.openai;
    const inputCost = (inputTokens / 1000) * p.inputPer1k;
    const outputCost = (outputTokens / 1000) * p.outputPer1k;
    return {
      inputCost: Math.round(inputCost * 1_000_000) / 1_000_000,
      outputCost: Math.round(outputCost * 1_000_000) / 1_000_000,
      totalCost: Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000,
    };
  }

  async recordCost(params: {
    requestLogId?: string;
    keyId?: string;
    keyName?: string;
    modelName?: string;
    providerName: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void> {
    try {
      const { inputCost, outputCost, totalCost } = this.calculateCost(
        params.providerName,
        params.inputTokens,
        params.outputTokens
      );

      const db = getDatabase();
      await db.insert(costRecords).values({
        requestLogId: params.requestLogId,
        keyId: params.keyId,
        keyName: params.keyName,
        modelName: params.modelName,
        providerName: params.providerName,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        inputCost,
        outputCost,
        totalCost,
      });
    } catch (error) {
      logger.warn({ error, provider: params.providerName }, 'Failed to record cost');
    }
  }

  async getCostSummary(params: {
    startDate?: Date;
    endDate?: Date;
    keyId?: string;
    providerName?: string;
    modelName?: string;
  }): Promise<{
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    requestCount: number;
  }> {
    const db = getDatabase();
    const conditions = this.buildConditions(params);

    const [result] = await db
      .select({
        totalCost: sql<number>`coalesce(sum(${costRecords.totalCost}), 0)`,
        totalInputTokens: sql<number>`coalesce(sum(${costRecords.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(${costRecords.outputTokens}), 0)`,
        requestCount: sql<number>`count(*)`,
      })
      .from(costRecords)
      .where(conditions);

    return {
      totalCost: Math.round(result.totalCost * 1_000_000) / 1_000_000,
      totalInputTokens: result.totalInputTokens,
      totalOutputTokens: result.totalOutputTokens,
      requestCount: result.requestCount,
    };
  }

  async getCostByDimension(params: {
    dimension: 'key' | 'provider' | 'model';
    startDate?: Date;
    endDate?: Date;
  }): Promise<
    Array<{
      name: string;
      totalCost: number;
      requestCount: number;
      inputTokens: number;
      outputTokens: number;
    }>
  > {
    const db = getDatabase();
    const conditions = this.buildConditions(params);

    const groupByColumn =
      params.dimension === 'key'
        ? costRecords.keyName
        : params.dimension === 'provider'
          ? costRecords.providerName
          : costRecords.modelName;

    const rows = await db
      .select({
        name: sql<string>`coalesce(${groupByColumn}, 'unknown')`,
        totalCost: sql<number>`coalesce(sum(${costRecords.totalCost}), 0)`,
        requestCount: sql<number>`count(*)`,
        inputTokens: sql<number>`coalesce(sum(${costRecords.inputTokens}), 0)`,
        outputTokens: sql<number>`coalesce(sum(${costRecords.outputTokens}), 0)`,
      })
      .from(costRecords)
      .where(conditions)
      .groupBy(groupByColumn)
      .orderBy(sql`sum(${costRecords.totalCost}) desc`);

    return rows.map((r) => ({
      name: r.name,
      totalCost: Math.round(r.totalCost * 1_000_000) / 1_000_000,
      requestCount: r.requestCount,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    }));
  }

  private buildConditions(params: { startDate?: Date; endDate?: Date; keyId?: string; providerName?: string; modelName?: string }) {
    const conds = [];
    if (params.startDate) conds.push(gte(costRecords.createdAt, params.startDate));
    if (params.endDate) conds.push(lte(costRecords.createdAt, params.endDate));
    if (params.keyId) conds.push(sql`${costRecords.keyId} = ${params.keyId}`);
    if (params.providerName) conds.push(sql`${costRecords.providerName} = ${params.providerName}`);
    if (params.modelName) conds.push(sql`${costRecords.modelName} = ${params.modelName}`);
    return conds.length > 0 ? and(...conds) : undefined;
  }
}

export const costService = new CostService();
