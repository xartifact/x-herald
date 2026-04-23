import { Hono, type Context } from 'hono';

import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';

import { handleOpenAIChatCompletion } from '../handlers/openai/chat-completion-handler';
import { handleResponsesAPI } from '../handlers/openai/responses-handler';

const openaiRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey;
  };
}>();

/**
 * OpenAI Chat Completions 兼容端点
 */
openaiRoutes.post('/chat/completions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const isStreaming = body.stream === true;
  return handleOpenAIChatCompletion(c, isStreaming, body);
});

/**
 * OpenAI Responses API 兼容端点（原生处理，无转换）
 */
openaiRoutes.post('/responses', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const isStreaming = body.stream === true;
  return handleResponsesAPI(c, isStreaming, body);
});

export default openaiRoutes;
