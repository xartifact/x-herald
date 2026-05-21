import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { jsonrepair } from 'jsonrepair';

import { getDatabase } from '@x-llm-gateway/engine';
import { callAI, AiNotConfiguredError } from '@x-llm-gateway/engine';
import { rootLogger } from '@x-llm-gateway/engine';
import { authMiddleware } from '@/features/auth/middleware';
import { modelInstances } from '@x-llm-gateway/engine';
import type { InstanceConfig } from '@x-llm-gateway/engine';
import { providers } from '@x-llm-gateway/engine';

import { buildSystemPrompt } from './prompt';

const logger = rootLogger.child({ module: 'ai-assist' });

const aiRoutes = new Hono();
aiRoutes.use('*', authMiddleware);

interface AgentRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface AgentResponse {
  explanation: string;
  previousConfig: InstanceConfig | null;
  newConfig: InstanceConfig;
  instanceName: string;
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
    rawText = await callAI([
      { role: 'system', content: systemPrompt },
      ...body.messages,
    ]);
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

export { aiRoutes };
