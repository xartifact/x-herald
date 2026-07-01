import { and, eq } from '@xartifact/x-llm-gateway-db';
import { jsonrepair } from 'jsonrepair';

import { getDatabase } from '../../db/client';
import { callAI } from '../../lib/ai-caller';
import { requestAttempts, requestLogs } from '@xartifact/x-llm-gateway-db';
import { modelInstances } from '@xartifact/x-llm-gateway-db';
import type { InstanceConfig } from '../model-groups/db';
import type { LogMetadata } from '../logs/db';

export interface DiagnosisResult {
  rootCause: string;
  errorCategory: 'param_error' | 'auth_error' | 'rate_limit' | 'provider_issue' | 'config_issue' | 'unknown';
  suggestions: FixSuggestion[];
  confidence: number;
}

export interface FixSuggestion {
  action: 'update_config' | 'remove_parameter' | 'add_parameter' | 'modify_transform' | 'add_header';
  field: string;
  value?: unknown;
  reason: string;
  autoApplicable: boolean;
}

interface DiagnosisContext {
  statusCode: number | null;
  errorMessage: string | null;
  errorType: string | null;
  provider: string | null;
  model: string | null;
  requestBody: unknown;
  clientResponseBody: unknown;
  providerResponseBody: unknown;
  currentConfig: InstanceConfig | null;
  instanceId: string | null;
}

export class ErrorDiagnoser {
  async diagnose(logId: string): Promise<DiagnosisResult & { instanceId: string | null }> {
    const db = getDatabase();

    const logRows = await db.select().from(requestLogs).where(eq(requestLogs.id, logId)).limit(1);
    if (logRows.length === 0) {
      throw new Error('Log not found');
    }
    const log = logRows[0];

    const attemptRows = await db
      .select({
        instanceId: requestAttempts.instanceId,
        providerResponseBody: requestAttempts.providerResponseBody,
      })
      .from(requestAttempts)
      .where(and(eq(requestAttempts.requestLogId, logId), eq(requestAttempts.candidateIndex, 0)))
      .limit(1);
    const attempt = attemptRows[0];

    const logMetadata = log.metadata as LogMetadata | null | undefined;
const instanceId = attempt?.instanceId ?? logMetadata?.routing?.instanceId ?? null;

    let currentConfig: InstanceConfig | null = null;
    if (instanceId) {
      const instanceRows = await db
        .select({ config: modelInstances.config })
        .from(modelInstances)
        .where(eq(modelInstances.id, instanceId))
        .limit(1);
      currentConfig = (instanceRows[0]?.config as InstanceConfig | null) ?? null;
    }

    const context: DiagnosisContext = {
      statusCode: log.statusCode,
      errorMessage: log.errorMessage,
      errorType: log.errorType,
      provider: log.providerName,
      model: log.modelName,
      requestBody: log.requestBody,
      clientResponseBody: log.responseBody,
      providerResponseBody: attempt?.providerResponseBody ?? null,
      currentConfig,
      instanceId,
    };

    const prompt = this.buildDiagnosisPrompt(context);
    const aiResponse = await callAI([{ role: 'user', content: prompt }]);
    const rawText = aiResponse.content;

    const parsed = this.parseDiagnosis(rawText);
    return { ...parsed, instanceId };
  }

  private buildDiagnosisPrompt(context: DiagnosisContext): string {
    return `你是一个 LLM API 错误诊断专家。分析以下错误并提供修复建议。

错误上下文:
${JSON.stringify(context, null, 2)}

请分析错误原因并提供修复建议。返回 JSON 格式:
{
  "rootCause": "错误根因描述",
  "errorCategory": "param_error|auth_error|rate_limit|provider_issue|config_issue",
  "suggestions": [
    {
      "action": "update_config|remove_parameter|add_parameter|modify_transform|add_header",
      "field": "配置字段路径",
      "value": "建议值",
      "reason": "修复原因",
      "autoApplicable": true/false
    }
  ],
  "confidence": 0.0-1.0
}`;
  }

  private parseDiagnosis(result: string): DiagnosisResult {
    try {
      const repaired = jsonrepair(result.trim());
      const parsed = JSON.parse(repaired) as Partial<DiagnosisResult>;
      return {
        rootCause: typeof parsed.rootCause === 'string' ? parsed.rootCause : '无法解析 AI 诊断结果',
        errorCategory: isValidCategory(parsed.errorCategory) ? parsed.errorCategory : 'unknown',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter(isValidSuggestion) : [],
        confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
      };
    } catch {
      return {
        rootCause: '无法解析 AI 诊断结果',
        errorCategory: 'unknown',
        suggestions: [],
        confidence: 0,
      };
    }
  }
}

function isValidCategory(value: unknown): value is DiagnosisResult['errorCategory'] {
  return (
    typeof value === 'string' &&
    ['param_error', 'auth_error', 'rate_limit', 'provider_issue', 'config_issue', 'unknown'].includes(value)
  );
}

function isValidSuggestion(value: unknown): value is FixSuggestion {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.action === 'string' &&
    ['update_config', 'remove_parameter', 'add_parameter', 'modify_transform', 'add_header'].includes(s.action) &&
    typeof s.field === 'string' &&
    typeof s.reason === 'string' &&
    typeof s.autoApplicable === 'boolean'
  );
}
