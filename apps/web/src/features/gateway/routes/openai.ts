import { Hono, type Context } from 'hono';

import logger from '@/core/lib/logger';
import type { VirtualKey } from '@/features/keys/db';

import { handleChatCompletion } from '../services/chat-completion-handler';

/**
 * 将 OpenAI Responses API 请求转换为 Chat Completions API 格式
 */
function convertResponsesToChatCompletions(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {
    model: body.model,
    stream: body.stream ?? false,
  };

  // 转换 input 数组为 messages 数组
  if (Array.isArray(body.input)) {
    const messages: Array<{ role: string; content: string | unknown[] }> = [];

    // 添加 instructions 作为 system 消息
    if (body.instructions && typeof body.instructions === 'string') {
      messages.push({
        role: 'system',
        content: body.instructions,
      });
    }

    for (const item of body.input) {
      if (typeof item !== 'object' || item === null) continue;

      const inputItem = item as { role?: string; content?: unknown; type?: string; text?: string };

      // 处理标准 role/content 格式
      if (inputItem.role) {
        const role = inputItem.role === 'assistant' ? 'assistant' : 'user';
        const content = convertResponseContent(inputItem.content);
        messages.push({ role, content });
      }
      // 处理简单输入格式
      else if (inputItem.type === 'input_text' && inputItem.text) {
        messages.push({
          role: 'user',
          content: inputItem.text,
        });
      }
    }

    result.messages = messages;
  }

  // 转换参数
  if (body.max_output_tokens !== undefined) {
    result.max_tokens = body.max_output_tokens;
  }
  if (body.temperature !== undefined) {
    result.temperature = body.temperature;
  }
  if (body.top_p !== undefined) {
    result.top_p = body.top_p;
  }
  if (body.tools !== undefined) {
    result.tools = body.tools;
  }
  if (body.tool_choice !== undefined) {
    result.tool_choice = body.tool_choice;
  }
  if (body.stop !== undefined) {
    result.stop = body.stop;
  }

  // 透传 stream_options
  if (body.stream_options !== undefined) {
    result.stream_options = body.stream_options;
  }

  return result;
}

/**
 * 转换 Responses API 的内容格式为 Chat Completions 格式
 */
function convertResponseContent(content: unknown): string | unknown[] {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return String(content ?? '');
  }

  // 转换内容数组
  const converted: unknown[] = [];
  for (const item of content) {
    if (typeof item !== 'object' || item === null) continue;

    const contentItem = item as { type?: string; text?: string; image_url?: { url: string } };

    if (contentItem.type === 'input_text' || contentItem.type === 'output_text') {
      converted.push({
        type: 'text',
        text: contentItem.text || '',
      });
    } else if (contentItem.type === 'input_image' && contentItem.image_url) {
      converted.push({
        type: 'image_url',
        image_url: contentItem.image_url,
      });
    } else {
      // 透传其他类型
      converted.push(item);
    }
  }

  return converted.length === 1 && typeof converted[0] === 'object'
    ? (converted[0] as { text?: string }).text || converted
    : converted;
}

/**
 * 将 Chat Completions 非流式响应转换为 Responses API 格式
 */
async function convertNonStreamToResponsesFormat(
  c: Context,
  response: Response,
  originalInput: Array<unknown>
): Promise<Response> {
  try {
    const data = await response.clone().json();

    // 转换 choices 为 output 格式
    const output: Array<Record<string, unknown>> = [];

    if (data.choices && Array.isArray(data.choices)) {
      for (const choice of data.choices) {
        const message = choice.message;
        if (!message) continue;

        const content: Array<Record<string, unknown>> = [];

        // 处理文本内容
        if (typeof message.content === 'string') {
          content.push({
            type: 'output_text',
            text: message.content,
          });
        } else if (Array.isArray(message.content)) {
          // 转换多模态内容
          for (const item of message.content) {
            if (item.type === 'text') {
              content.push({
                type: 'output_text',
                text: item.text || '',
              });
            }
          }
        }

        output.push({
          type: 'message',
          role: message.role || 'assistant',
          content,
        });
      }
    }

    // 构建 Responses API 格式响应
    const responsesFormat: Record<string, unknown> = {
      id: data.id?.replace('chatcmpl', 'resp') || `resp_${Date.now()}`,
      object: 'response',
      created_at: data.created || Math.floor(Date.now() / 1000),
      model: data.model,
      output,
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens || 0,
        output_tokens: data.usage.completion_tokens || 0,
        total_tokens: data.usage.total_tokens || 0,
      } : undefined,
    };

    return c.json(responsesFormat);
  } catch (error) {
    logger.error({ error }, 'Failed to convert non-stream response to Responses API format');
    // 转换失败时返回原始响应
    return response;
  }
}

/**
 * 将 Chat Completions 流式响应转换为 Responses API 格式
 * Responses API 使用事件驱动格式，需要生成多个事件
 */
function convertStreamToResponsesFormat(
  response: Response,
  _originalInput: Array<unknown>
): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // 状态追踪
  let responseId: string | undefined;
  let responseModel: string | undefined;
  let responseCreated: number | undefined;
  let outputItemId: string | undefined;
  let hasSentCreated = false;
  let hasSentOutputItem = false;
  const outputIndex = 0;

  // 创建转换流
  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = decoder.decode(chunk);
      const lines = text.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          if (line.trim()) {
            controller.enqueue(encoder.encode(line + '\n'));
          }
          continue;
        }

        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          // 发送完成事件
          if (responseId) {
            const completedEvent = {
              type: 'response.completed',
              response: {
                id: responseId,
                object: 'response',
                created_at: responseCreated,
                model: responseModel,
                output: [],
              },
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(completedEvent)}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          continue;
        }

        try {
          const json = JSON.parse(data);

          // 提取基本信息
          if (!responseId && json.id) {
            responseId = json.id.replace('chatcmpl', 'resp');
            responseModel = json.model;
            responseCreated = json.created;

            // 发送 response.created 事件
            if (!hasSentCreated) {
              const createdEvent = {
                type: 'response.created',
                response: {
                  id: responseId,
                  object: 'response',
                  created_at: responseCreated,
                  model: responseModel,
                  output: [],
                },
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(createdEvent)}\n\n`));
              hasSentCreated = true;
            }
          }

          // 处理 choices
          if (json.choices && Array.isArray(json.choices)) {
            for (const choice of json.choices) {
              const delta = choice.delta;
              if (!delta) continue;

              // 首次输出时发送 output_item.added
              if (!hasSentOutputItem && delta.role) {
                outputItemId = `msg_${Date.now()}`;
                const addedEvent = {
                  type: 'response.output_item.added',
                  output_index: outputIndex,
                  item: {
                    id: outputItemId,
                    type: 'message',
                    role: delta.role,
                    content: [],
                  },
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(addedEvent)}\n\n`));
                hasSentOutputItem = true;
              }

              // 发送文本增量
              if (delta.content && outputItemId) {
                const deltaEvent = {
                  type: 'response.output_text.delta',
                  item_id: outputItemId,
                  output_index: outputIndex,
                  delta: delta.content,
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(deltaEvent)}\n\n`));
              }

              // 完成时发送 output_item.done
              if (choice.finish_reason && outputItemId) {
                const doneEvent = {
                  type: 'response.output_item.done',
                  output_index: outputIndex,
                  item: {
                    id: outputItemId,
                    type: 'message',
                    role: delta.role || 'assistant',
                    content: [],
                  },
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
              }
            }
          }
        } catch {
          // 解析失败，原样透传
          controller.enqueue(encoder.encode(line + '\n'));
        }
      }
    },
  });

  const transformedBody = response.body?.pipeThrough(transformStream);

  return new Response(transformedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

const openaiRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey;
  };
}>();

/**
 * OpenAI 兼容端点
 */
openaiRoutes.post('/chat/completions', async (c) => {
  // 从请求体中读取 stream 字段，用于日志记录
  // 注意：实际的流式处理在 handleChatCompletion 内部根据 standardReq.stream 决定
  const body = await c.req.json().catch(() => ({}));
  const isStreaming = body.stream === true;
  return handleChatCompletion(c, isStreaming);
});

/**
 * OpenAI Responses API 兼容端点
 * 将 Responses API 格式转换为 Chat Completions 格式处理
 * 并将响应转换回 Responses API 格式
 */
openaiRoutes.post('/responses', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const isStreaming = body.stream === true;

  // 转换 Responses API 格式为 Chat Completions 格式
  const convertedBody = convertResponsesToChatCompletions(body);

  // 保存原始请求的 input 用于后续处理
  const originalInput = body.input;

  // 调用 chat completions 处理（传入转换后的 body）
  const response = await handleChatCompletion(c, isStreaming, convertedBody);

  // 将响应转换为 Responses API 格式
  if (isStreaming) {
    return convertStreamToResponsesFormat(response, originalInput as Array<unknown>);
  } else {
    return convertNonStreamToResponsesFormat(c, response, originalInput as Array<unknown>);
  }
});

export default openaiRoutes;
