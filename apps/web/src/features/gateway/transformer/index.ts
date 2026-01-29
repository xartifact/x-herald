/**
 * Transformer 模块入口
 * 注册所有内置 Transformer
 */

import { OpenAITransformer } from './protocols/openai';
import { AnthropicTransformer } from './protocols/anthropic';
import { registerTransformer } from './registry';
import { TransformerChain, buildRequestChain, buildResponseChain } from './chain';

// 注册内置协议转换器
export function registerDefaultTransformers(): void {
  registerTransformer('openai', OpenAITransformer);
  registerTransformer('anthropic', AnthropicTransformer);
  // TODO: 添加更多协议支持
  // registerTransformer('gemini', GeminiTransformer);
  // registerTransformer('vertex', VertexTransformer);
}

// 导出核心类
export {
  // 注册表
  registerTransformer,
  getTransformer,
  hasTransformer,
  listTransformers,
  transformerRegistry,
} from './registry';

// 导出 Chain
export {
  TransformerChain,
  buildRequestChain,
  buildResponseChain,
} from './chain';

// 导出协议转换器
export { OpenAITransformer } from './protocols/openai';
export { AnthropicTransformer } from './protocols/anthropic';

// 导出工具函数
export function createTransformerContext(requestId: string): import('@x-llm-gateway/shared').TransformerContext {
  return {
    requestId,
    startTime: Date.now(),
    state: new Map(),
  };
}
