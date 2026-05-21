import type { TransformerContext, StandardRequest } from '@x-llm-gateway/shared';
import type { InstanceConfig } from '../../../../features/model-groups/db';

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
  const paramTransforms = ctx.instanceConfig?.parameterTransforms as InstanceConfig['parameterTransforms'] | undefined;
  if (paramTransforms) {
    transformedRequest = applyParameterTransforms(
      request,
      paramTransforms,
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
    const schemaCfg = ctx.instanceConfig?.schemaConfig as Record<string, unknown> | undefined;
    const schemaConfig = schemaCfg
      ? {
          cleanEnabled: (schemaCfg.cleanEnabled ?? true) as boolean,
          preserveFields: schemaCfg.preserveFields as string[] | undefined,
          additionalBannedFields: schemaCfg.additionalBannedFields as string[] | undefined,
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

  return {
    body: openaiReq,
    headers: {
      'Content-Type': 'application/json',
    },
  };
}
