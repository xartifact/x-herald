import type { TransformerContext, StandardRequest } from '@/types';

import { convertToOpenAIMessages } from './converters/message-converter';
import type { OpenAIRequest } from './types';
import { applyParameterTransforms } from '../../shared/parameter-transformer';
import { cleanSchemaForOpenAI } from '../../shared/schema-cleaner';

/**
 * Adapt standard request to OpenAI format
 */
export async function adaptOpenAIRequest(
  request: StandardRequest,
  ctx: TransformerContext,
): Promise<{ body: unknown; url?: string; headers?: Record<string, string> }> {
  let transformedRequest = request;
  if (ctx.instanceConfig?.parameterTransforms) {
    transformedRequest = applyParameterTransforms(
      request,
      ctx.instanceConfig.parameterTransforms,
      ctx
    );
  }

  const openaiReq: OpenAIRequest = {
    model: transformedRequest.model,
    messages: convertToOpenAIMessages(transformedRequest.messages),
    temperature: transformedRequest.temperature,
    max_tokens: transformedRequest.max_tokens,
    top_p: transformedRequest.top_p,
    frequency_penalty: transformedRequest.frequency_penalty,
    presence_penalty: transformedRequest.presence_penalty,
    stream: transformedRequest.stream,
    stream_options: transformedRequest.stream_options,
    stop: transformedRequest.stop,
    seed: transformedRequest.seed,
  };

  if (transformedRequest.tools?.length) {
    const schemaConfig = ctx.instanceConfig?.schemaConfig
      ? {
          cleanEnabled: ctx.instanceConfig.schemaConfig.cleanEnabled,
          preserveFields: ctx.instanceConfig.schemaConfig.preserveFields,
          additionalBannedFields: ctx.instanceConfig.schemaConfig.additionalBannedFields,
        }
      : undefined;
    openaiReq.tools = transformedRequest.tools.map(({ _passthrough: _, ...tool }) => ({
      ...tool,
      function: {
        ...tool.function,
        parameters: tool.function.parameters
          ? cleanSchemaForOpenAI(tool.function.parameters, schemaConfig) as typeof tool.function.parameters
          : tool.function.parameters,
      },
    }));

    if (transformedRequest.tool_choice) {
      openaiReq.tool_choice = transformedRequest.tool_choice;
    }
  }

  if (transformedRequest.response_format) {
    openaiReq.response_format = transformedRequest.response_format;
  }

  if (transformedRequest.output_config) {
    openaiReq.response_format = {
      type: transformedRequest.output_config.type,
      schema: transformedRequest.output_config.schema,
    };
  }

  if (transformedRequest.reasoning?.effort) {
    openaiReq.reasoning_effort = transformedRequest.reasoning.effort;
  }

  if (ctx.instanceConfig?.parameterMapping) {
    for (const [param, config] of Object.entries(ctx.instanceConfig.parameterMapping)) {
      if (config.default !== undefined && openaiReq[param as keyof OpenAIRequest] === undefined) {
        (openaiReq as unknown as Record<string, unknown>)[param] = config.default;
      }
    }
  }

  // Kimi 等 thinking 模型要求 history 中每条 assistant 消息必须有 reasoning_content。
  // 客户端（OpenAI SDK）不识别该字段会在多轮对话中丢弃，这里补回空字符串以通过校验。
  if (ctx.instanceConfig?.patchMissingReasoningContent) {
    openaiReq.messages = openaiReq.messages.map((msg) => {
      if (msg.role === 'assistant' && !msg.reasoning_content) {
        return { ...msg, reasoning_content: '' };
      }
      return msg;
    });
  }

  return {
    body: openaiReq,
    headers: {
      'Content-Type': 'application/json',
    },
  };
}
