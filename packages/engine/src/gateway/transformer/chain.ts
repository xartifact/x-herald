/**
 * Transformer Chain 执行器
 * 按顺序执行多个 Transformer，处理请求和响应的转换
 */

import logger from '../../lib/logger';
import type {
  StandardRequest,
  StandardResponse,
  Transformer,
  TransformerContext,
  TransformerChainConfig,
} from '@x-llm-gateway/shared';

import { getTransformer } from './registry';

export interface ChainResult<T> {
  data: T;
  ctx: TransformerContext;
  metadata: {
    transformers: string[];
    duration: number;
  };
}

export class TransformerChain {
  private transformers: Transformer[] = [];

  constructor(
    private names: string[],
    private direction: 'request' | 'response',
  ) {
    this.transformers = names
      .map((name) => getTransformer(name))
      .filter((t): t is Transformer => t !== undefined);
  }

  /**
   * 创建用于标准化请求的 Chain（外部协议 -> 标准格式）
   */
  static forNormalization(names: string | string[]): TransformerChain {
    const nameList = Array.isArray(names) ? names : [names];
    return new TransformerChain(nameList, 'request');
  }

  /**
   * 创建用于适配请求的 Chain（标准格式 -> Provider 协议）
   */
  static forAdaptation(names: string | string[]): TransformerChain {
    const nameList = Array.isArray(names) ? names : [names];
    return new TransformerChain(nameList, 'request');
  }

  /**
   * 执行请求标准化
   */
  async normalize(request: unknown, ctx: TransformerContext): Promise<ChainResult<StandardRequest>> {
    const startTime = Date.now();
    const executed: string[] = [];

    let current = request;

    for (const transformer of this.transformers) {
      if (transformer.normalizeRequest) {
        try {
          current = await transformer.normalizeRequest(current, ctx);
          executed.push(transformer.name);
        } catch (error) {
          logger.error(
            { error, transformer: transformer.name, requestId: ctx.requestId },
            'Request normalization failed',
          );
          throw error;
        }
      }
    }

    return {
      data: current as StandardRequest,
      ctx,
      metadata: {
        transformers: executed,
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * 执行请求适配
   */
  async adapt(
    request: StandardRequest,
    ctx: TransformerContext,
  ): Promise<
    ChainResult<{
      body: unknown;
      url?: string;
      headers?: Record<string, string>;
    }>
  > {
    const startTime = Date.now();
    const executed: string[] = [];

    let currentRequest = request;
    let adapterResult: { body: unknown; url?: string; headers?: Record<string, string> } | null = null;

    for (const transformer of this.transformers) {
      // 先执行普通转换
      if (transformer.normalizeRequest) {
        try {
          currentRequest = await transformer.normalizeRequest(currentRequest, ctx);
          executed.push(`${transformer.name}:normalize`);
        } catch (error) {
          logger.error(
            { error, transformer: transformer.name, requestId: ctx.requestId },
            'Request adaptation failed',
          );
          throw error;
        }
      }

      // 再执行适配
      if (transformer.adaptRequest) {
        try {
          adapterResult = await transformer.adaptRequest(currentRequest, ctx);
          executed.push(`${transformer.name}:adapt`);
        } catch (error) {
          logger.error(
            { error, transformer: transformer.name, requestId: ctx.requestId },
            'Request adaptation failed',
          );
          throw error;
        }
      }
    }

    if (!adapterResult) {
      throw new Error('No adapter found in chain');
    }

    return {
      data: adapterResult,
      ctx,
      metadata: {
        transformers: executed,
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * 执行响应标准化
   */
  async normalizeResponse(
    response: Response,
    ctx: TransformerContext,
  ): Promise<ChainResult<StandardResponse>> {
    const startTime = Date.now();
    const executed: string[] = [];

    const current = response;

    for (const transformer of this.transformers) {
      if (transformer.normalizeResponse) {
        try {
          // 注意：normalizeResponse 返回的是 StandardResponse，不是 Response
          const result = await transformer.normalizeResponse(current, ctx);
          return {
            data: result,
            ctx,
            metadata: {
              transformers: [...executed, transformer.name],
              duration: Date.now() - startTime,
            },
          };
        } catch (error) {
          logger.error(
            { error, transformer: transformer.name, requestId: ctx.requestId },
            'Response normalization failed',
          );
          throw error;
        }
      }
    }

    throw new Error('No response normalizer found in chain');
  }

  /**
   * 执行响应适配
   */
  async adaptResponse(
    response: StandardResponse,
    ctx: TransformerContext,
  ): Promise<ChainResult<Response>> {
    const startTime = Date.now();
    const executed: string[] = [];

    const current = response;

    for (const transformer of this.transformers) {
      if (transformer.adaptResponse) {
        try {
          const result = await transformer.adaptResponse(current, ctx);
          return {
            data: result,
            ctx,
            metadata: {
              transformers: [...executed, transformer.name],
              duration: Date.now() - startTime,
            },
          };
        } catch (error) {
          logger.error(
            { error, transformer: transformer.name, requestId: ctx.requestId },
            'Response adaptation failed',
          );
          throw error;
        }
      }
    }

    throw new Error('No response adapter found in chain');
  }

  /**
   * 处理流式响应转换
   */
  async transformStream(
    stream: ReadableStream,
    ctx: TransformerContext,
  ): Promise<ReadableStream> {
    let currentStream = stream;

    for (const transformer of this.transformers) {
      if (transformer.transformStream) {
        try {
          currentStream = await transformer.transformStream(currentStream, ctx);
        } catch (error) {
          logger.error(
            { error, transformer: transformer.name, requestId: ctx.requestId },
            'Stream transformation failed',
          );
          throw error;
        }
      }
    }

    return currentStream;
  }
}

/**
 * 构建完整的请求处理 Chain
 */
export function buildRequestChain(
  ingressNames: string[],
  egressNames: string[],
): {
  ingress: TransformerChain;
  egress: TransformerChain;
} {
  return {
    ingress: TransformerChain.forNormalization(ingressNames),
    egress: TransformerChain.forAdaptation(egressNames),
  };
}

/**
 * 构建完整的响应处理 Chain
 */
export function buildResponseChain(
  ingressNames: string[],
  egressNames: string[],
): {
  ingress: TransformerChain;
  egress: TransformerChain;
} {
  return {
    ingress: TransformerChain.forNormalization(ingressNames),
    egress: TransformerChain.forAdaptation(egressNames),
  };
}
