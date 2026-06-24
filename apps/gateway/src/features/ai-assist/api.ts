import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { jsonrepair } from 'jsonrepair';

import { getDatabase } from '../../db/client';
import { callAI, AiNotConfiguredError } from '../../lib';
import { rootLogger } from '../../lib';
import { modelInstances } from '../model-groups/db';
import type { InstanceConfig } from '../model-groups/db';
import { providers } from '../providers/db';

import { ErrorDiagnoser } from './error-diagnoser';
import { ErrorPatternLearner } from './error-patterns';
import { buildSystemPrompt } from './prompt';
import { getAgent } from './agent-setup';

const logger = rootLogger.child({ module: 'ai-assist' });

const aiRoutes = new Hono();

const diagnoser = new ErrorDiagnoser();
const patternLearner = new ErrorPatternLearner();

interface AgentRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface AgentResponse {
  explanation: string;
  previousConfig: InstanceConfig | null;
  newConfig: InstanceConfig;
  instanceName: string;
}

interface ApplyFixRequest {
  instanceId: string;
  suggestion: {
    action: 'update_config' | 'remove_parameter' | 'add_parameter' | 'modify_transform' | 'add_header';
    field: string;
    value?: unknown;
    reason: string;
    autoApplicable: boolean;
  };
  errorType?: string;
  provider?: string;
  model?: string;
}

// POST /api/ai/agent/instance/:id
aiRoutes.post('/agent/instance/:id', async (c) => {
  const instanceId = c.req.param('id');
  const body = await c.req.json<AgentRequest>();

  if (!body.messages?.length) {
    return c.json({ success: false, error: 'messages is required' }, 400);
  }

  const db = getDatabase();

  // 查询实例 + Provider 名称
  const rows = await db
    .select({
      id: modelInstances.id,
      name: modelInstances.name,
      actualModelName: modelInstances.actualModelName,
      config: modelInstances.config,
      providerName: providers.name,
    })
    .from(modelInstances)
    .innerJoin(providers, eq(providers.id, modelInstances.providerId))
    .where(eq(modelInstances.id, instanceId))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ success: false, error: 'Instance not found' }, 404);
  }

  const instance = rows[0];
  const previousConfig = (instance.config ?? null) as InstanceConfig | null;

  const systemPrompt = buildSystemPrompt({
    instanceId,
    instanceName: instance.name,
    actualModelName: instance.actualModelName,
    providerName: instance.providerName,
    currentConfig: previousConfig,
  });

  let rawText: string;
  try {
    const aiResponse = await callAI([
      { role: 'system', content: systemPrompt },
      ...body.messages,
    ]);
    rawText = aiResponse.content;
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return c.json({ success: false, error: err.message, code: 'AI_NOT_CONFIGURED' }, 503);
    }
    logger.warn({ err }, 'AI call failed');
    return c.json({ success: false, error: 'AI request failed' }, 500);
  }

  // 解析 AI 返回的 JSON（容错处理）
  let parsed: { config: InstanceConfig; explanation: string };
  try {
    const repaired = jsonrepair(rawText.trim());
    parsed = JSON.parse(repaired);
    if (!parsed.config || typeof parsed.config !== 'object') {
      throw new Error('Invalid config shape');
    }
  } catch (err) {
    logger.warn({ err, rawText }, 'Failed to parse AI response');
    return c.json({ success: false, error: 'AI returned invalid JSON. Please try again.' }, 422);
  }

  // 写库
  await db
    .update(modelInstances)
    .set({ config: parsed.config, updatedAt: new Date() })
    .where(eq(modelInstances.id, instanceId));

  logger.info({ instanceId, instanceName: instance.name }, 'AI updated instance config');

  const response: AgentResponse = {
    explanation: parsed.explanation ?? '',
    previousConfig,
    newConfig: parsed.config,
    instanceName: instance.name,
  };

  return c.json({ success: true, data: response });
});

// POST /api/ai/agent/instance/:id/undo
aiRoutes.post('/agent/instance/:id/undo', async (c) => {
  const instanceId = c.req.param('id');
  const body = await c.req.json<{ previousConfig: InstanceConfig | null }>();

  const db = getDatabase();

  const rows = await db
    .select({ id: modelInstances.id })
    .from(modelInstances)
    .where(eq(modelInstances.id, instanceId))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ success: false, error: 'Instance not found' }, 404);
  }

  await db
    .update(modelInstances)
    .set({ config: body.previousConfig ?? null, updatedAt: new Date() })
    .where(eq(modelInstances.id, instanceId));

  logger.info({ instanceId }, 'AI config change undone');

  return c.json({ success: true });
});

// POST /api/ai/agent/run - General Agent execution
aiRoutes.post('/agent/run', async (c) => {
  const body = await c.req.json<{ prompt: string; skill?: string; tools?: string[]; maxTurns?: number }>();

  if (!body.prompt) {
    return c.json({ success: false, error: 'prompt is required' }, 400);
  }

  try {
    const agent = getAgent();
    const result = await agent.run({
      prompt: body.prompt,
      skill: body.skill,
      tools: body.tools,
      maxTurns: body.maxTurns,
    });
    return c.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return c.json({ success: false, error: err.message, code: 'AI_NOT_CONFIGURED' }, 503);
    }
    logger.warn({ err }, 'Agent run failed');
    return c.json({ success: false, error: 'Agent request failed' }, 500);
  }
});

// POST /api/ai/agent/diagnose - Quick error diagnosis
aiRoutes.post('/agent/diagnose', async (c) => {
  const body = await c.req.json<{ logId: string }>();

  if (!body.logId) {
    return c.json({ success: false, error: 'logId is required' }, 400);
  }

  try {
    const agent = getAgent();
    const result = await agent.run({
      prompt: `Diagnose this request error: logId=${body.logId}`,
      skill: 'error-diagnosis',
    });
    return c.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return c.json({ success: false, error: err.message, code: 'AI_NOT_CONFIGURED' }, 503);
    }
    logger.warn({ err }, 'Agent diagnosis failed');
    return c.json({ success: false, error: 'Agent diagnosis request failed' }, 500);
  }
});

// POST /api/ai/agent/generate-config - Quick config generation
aiRoutes.post('/agent/generate-config', async (c) => {
  const body = await c.req.json<{ instanceId: string; description: string }>();

  if (!body.instanceId) {
    return c.json({ success: false, error: 'instanceId is required' }, 400);
  }

  try {
    const agent = getAgent();
    const result = await agent.run({
      prompt: `Generate configuration for instance ${body.instanceId}: ${body.description}`,
      skill: 'config-generation',
    });
    return c.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return c.json({ success: false, error: err.message, code: 'AI_NOT_CONFIGURED' }, 503);
    }
    logger.warn({ err }, 'Agent config generation failed');
    return c.json({ success: false, error: 'Agent config generation request failed' }, 500);
  }
});

// POST /api/ai/diagnose - AI 错误诊断
aiRoutes.post('/diagnose', async (c) => {
  const body = await c.req.json<{ logId: string }>();
  if (!body.logId) {
    return c.json({ success: false, error: 'logId is required' }, 400);
  }

  try {
    const result = await diagnoser.diagnose(body.logId);
    return c.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return c.json({ success: false, error: err.message, code: 'AI_NOT_CONFIGURED' }, 503);
    }
    if (err instanceof Error && err.message === 'Log not found') {
      return c.json({ success: false, error: err.message }, 404);
    }
    if (err instanceof Error && err.message.startsWith('AI provider returned')) {
      const statusCode = err.message.match(/(\d+)/)?.[0] ?? 'unknown';
      const userMsg = `AI 诊断模型不可用（上游返回 ${statusCode}），请在「设置 → AI 功能模型」中选择一个可用模型`;
      return c.json({ success: false, error: userMsg, code: 'AI_PROVIDER_ERROR' }, 502);
    }
    logger.warn({ err }, 'Diagnosis failed');
    return c.json({ success: false, error: '诊断服务内部错误，请稍后重试' }, 500);
  }
});

// POST /api/ai/diagnose/stream - 流式诊断（SSE）
aiRoutes.post('/diagnose/stream', async (c) => {
  const body = await c.req.json<{ logId: string }>();
  if (!body.logId) {
    return c.json({ success: false, error: 'logId is required' }, 400);
  }

  return streamSSE(c, async (stream) => {
    try {
      await stream.writeSSE({ event: 'start', data: JSON.stringify({ logId: body.logId }) });
      const result = await diagnoser.diagnose(body.logId);
      await stream.writeSSE({ event: 'diagnosis', data: JSON.stringify(result) });
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ completed: true }) });
    } catch (err) {
      let message = '诊断请求失败，请稍后重试';
      if (err instanceof AiNotConfiguredError) {
        message = '未配置 AI 诊断模型，请在「设置 → AI 功能模型」中选择一个可用模型';
      } else if (err instanceof Error && err.message.startsWith('AI provider returned')) {
        message = 'AI 诊断模型不可用（上游返回 403），请在「设置 → AI 功能模型」中选择一个可用模型';
      }
      logger.warn({ err }, 'Streaming diagnosis failed');
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: message }) });
    }
  });
});

// POST /api/ai/apply-fix - 应用修复
aiRoutes.post('/apply-fix', async (c) => {
  const body = await c.req.json<ApplyFixRequest>();
  if (!body.instanceId) {
    return c.json({ success: false, error: 'instanceId is required' }, 400);
  }
  if (!body.suggestion) {
    return c.json({ success: false, error: 'suggestion is required' }, 400);
  }

  const db = getDatabase();

  const rows = await db
    .select({ config: modelInstances.config })
    .from(modelInstances)
    .where(eq(modelInstances.id, body.instanceId))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ success: false, error: 'Instance not found' }, 404);
  }

  const currentConfig = (rows[0].config ?? {}) as InstanceConfig;
  const updatedConfig = applySuggestion(currentConfig, body.suggestion);

  await db
    .update(modelInstances)
    .set({ config: updatedConfig, updatedAt: new Date() })
    .where(eq(modelInstances.id, body.instanceId));

  logger.info(
    { instanceId: body.instanceId, action: body.suggestion.action, field: body.suggestion.field },
    'AI fix applied'
  );

  if (body.errorType && body.provider && body.model) {
    await patternLearner.recordResolution({
      errorType: body.errorType,
      provider: body.provider,
      model: body.model,
      fix: updatedConfig,
    });
  }

  return c.json({ success: true, data: { config: updatedConfig } });
});

// GET /api/ai/patterns - 获取常见错误模式
aiRoutes.get('/patterns', async (c) => {
  try {
    const patterns = await patternLearner.getCommonPatterns();
    return c.json({ success: true, data: patterns });
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch error patterns');
    return c.json({ success: false, error: 'Failed to fetch error patterns' }, 500);
  }
});

function applySuggestion(
  config: InstanceConfig,
  suggestion: ApplyFixRequest['suggestion']
): InstanceConfig {
  const next: InstanceConfig = JSON.parse(JSON.stringify(config)) as InstanceConfig;

  switch (suggestion.action) {
    case 'update_config': {
      setPath(next as Record<string, unknown>, suggestion.field, suggestion.value);
      break;
    }
    case 'remove_parameter': {
      if (!next.parameterMapping) next.parameterMapping = {};
      deletePath(next.parameterMapping as Record<string, unknown>, suggestion.field);
      break;
    }
    case 'add_parameter': {
      if (!next.parameterMapping) next.parameterMapping = {};
      setPath(next.parameterMapping as Record<string, unknown>, suggestion.field, suggestion.value ?? { default: null });
      break;
    }
    case 'add_header': {
      if (!next.customHeaders) next.customHeaders = {};
      setPath(next.customHeaders as Record<string, unknown>, suggestion.field, suggestion.value ?? '');
      break;
    }
    case 'modify_transform': {
      if (!next.parameterTransforms) next.parameterTransforms = [];
      const existingIndex = next.parameterTransforms.findIndex(
        (t) => t.action.targetParam === suggestion.field
      );
      const entry = {
        when: { paramName: suggestion.field, operator: 'exists' as const },
        action: {
          type: 'transform' as const,
          targetParam: suggestion.field,
          value: suggestion.value,
        },
      };
      if (existingIndex >= 0) {
        next.parameterTransforms[existingIndex] = entry;
      } else {
        next.parameterTransforms.push(entry);
      }
      break;
    }
  }

  return next;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let target: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {};
    }
    target = target[key] as Record<string, unknown>;
  }
  target[parts[parts.length - 1]] = value;
}

function deletePath(obj: Record<string, unknown>, path: string): void {
  const parts = path.split('.');
  let target: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!target[key] || typeof target[key] !== 'object') return;
    target = target[key] as Record<string, unknown>;
  }
  delete target[parts[parts.length - 1]];
}

export { aiRoutes };
