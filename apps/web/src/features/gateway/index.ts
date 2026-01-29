/**
 * Gateway Feature
 * 统一网关入口，处理所有 LLM API 请求
 */

// 导出 API 路由
export { default as gatewayRoutes } from './api';

// 导出中间件
export { virtualKeyMiddleware } from './middleware';

// 导出服务
export {
  modelGroupRouter,
  ModelNotFoundError,
  ModelDisabledError,
  NoAvailableInstanceError,
  NoSuitableInstanceError,
  type RouteResult,
  type RoutingContext,
} from './services';

// 导出 Transformer
export {
  registerDefaultTransformers,
  registerTransformer,
  getTransformer,
  hasTransformer,
  listTransformers,
  transformerRegistry,
  TransformerChain,
  buildRequestChain,
  buildResponseChain,
  createTransformerContext,
  OpenAITransformer,
  AnthropicTransformer,
} from './transformer';
