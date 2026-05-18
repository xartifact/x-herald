import { AiNotConfiguredError, getAiModel } from '@/core/lib/ai-caller';
import rootLogger from '@/core/lib/logger';

import { getLogDetail } from './log-query';

const logger = rootLogger.child({ module: 'log-analyzer' });

export class AnalyzeLogError extends Error {
  constructor(message: string, readonly statusCode: 400 | 404 | 503) {
    super(message)
  }
}

type RawMessage = { role: string; content: unknown }

function formatContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((b) => {
      if (typeof b !== 'object' || b === null) return '';
      return 'text' in b ? String((b as Record<string, unknown>).text) : '';
    }).filter(Boolean).join('\n');
  }
  return JSON.stringify(content);
}

function buildAnalysisMessages(messages: RawMessage[]): { role: string; content: string }[] {
  const conversationText = messages
    .map((m) => `[${m.role.toUpperCase()}]:\n${formatContent(m.content)}`)
    .join('\n\n');
  return [
    { role: 'system', content: '你是一个专业的 AI 对话分析师。请用中文简洁地分析用户提供的对话内容，输出结构清晰、重点突出的分析报告。' },
    { role: 'user', content: `请对以下 AI 对话请求进行分析，包含：\n1. **对话目的**：这段对话的主要意图\n2. **内容摘要**：核心信息提取\n3. **质量评估**：清晰度、上下文完整性等\n4. **工具使用**（如有）：工具调用情况分析\n5. **优化建议**（如有明显问题）\n\n保持简洁，每项不超过 2-3 句话。\n\n---\n${conversationText}\n---` },
  ];
}

export async function buildAnalysisStream(logId: string, indices?: number[]): Promise<ReadableStream<Uint8Array>> {
  const log = await getLogDetail(logId);
  if (!log) throw new AnalyzeLogError('Log not found', 404);

  const rawMessages =
    (log.requestBody as Record<string, unknown> | null)?.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    throw new AnalyzeLogError('No messages in this log', 400);
  }

  let messages = rawMessages as RawMessage[];
  if (indices && indices.length > 0) {
    messages = indices.map((i) => messages[i]).filter(Boolean);
  }

  let aiModel: Awaited<ReturnType<typeof getAiModel>>;
  try {
    aiModel = await getAiModel();
  } catch (err) {
    if (err instanceof AiNotConfiguredError) throw new AnalyzeLogError((err as Error).message, 503);
    throw err;
  }

  const { actualModelName, apiKey, baseUrl } = aiModel;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model: actualModelName, messages: buildAnalysisMessages(messages), stream: true, max_tokens: 1024 }),
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.warn({ status: response.status, body: errText }, 'Analysis provider error');
    const errPayload = `data: {"error":"Provider returned ${response.status}"}\n\ndata: [DONE]\n\n`;
    return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(errPayload)); c.close(); } });
  }

  return response.body!;
}
