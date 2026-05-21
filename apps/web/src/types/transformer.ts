/**
 * Transformer 类型定义
 * 定义协议转换器的接口和上下文
 */

import type { InstanceConfig } from '@x-llm-gateway/engine';

import type {
  StandardRequest,
  StandardResponse,
  ProviderConfig,
  ProtocolType,
} from './llm';

// ==================== Transformer 上下文 ====================

export interface TransformerContext {
  // 请求信息
  requestId: string;
  startTime: number;

  // Provider 信息
  provider?: ProviderConfig;
  targetProtocol?: ProtocolType;

  // 模型实例配置
  instanceConfig?: InstanceConfig;

  // 原始请求/响应
  originalRequest?: unknown;
  originalResponse?: Response;

  // 中间状态（在转换器链中传递）
  state: Map<string, unknown>;

  // 元数据
  metadata?: Record<string, unknown>;
}

// ==================== Transformer 接口 ====================

export interface Transformer {
  /** Transformer 名称 */
  readonly name: string;

  /** 支持的协议 */
  readonly supportedProtocols?: ProtocolType[];

  /**
   * 将外部请求转换为标准格式
   * @param request 外部请求（如 OpenAI/Anthropic 格式）
   * @param ctx 转换上下文
   * @returns 标准请求格式
   */
  normalizeRequest?(
    request: unknown,
    ctx: TransformerContext
  ): Promise<StandardRequest>;

  /**
   * 将标准请求转换为目标 Provider 格式
   * @param request 标准请求
   * @param ctx 转换上下文
   * @returns 适配后的请求和配置
   */
  adaptRequest?(
    request: StandardRequest,
    ctx: TransformerContext
  ): Promise<{
    body: unknown;
    url?: string;
    headers?: Record<string, string>;
  }>;

  /**
   * 将目标 Provider 响应转换为标准格式
   * @param response Provider 原始响应
   * @param ctx 转换上下文
   * @returns 标准响应格式
   */
  normalizeResponse?(
    response: Response,
    ctx: TransformerContext
  ): Promise<StandardResponse>;

  /**
   * 将标准响应转换为目标协议格式
   * @param response 标准响应
   * @param ctx 转换上下文
   * @returns 目标协议格式的 Response
   */
  adaptResponse?(
    response: StandardResponse,
    ctx: TransformerContext
  ): Promise<Response>;

  /**
   * 处理流式响应转换
   * @param stream 原始流
   * @param ctx 转换上下文
   * @returns 转换后的流
   */
  transformStream?(
    stream: ReadableStream,
    ctx: TransformerContext
  ): Promise<ReadableStream>;
}

// ==================== Transformer 构造函数 ====================

export interface TransformerConstructor {
  new (options?: Record<string, unknown>): Transformer;
}

// ==================== Transformer 链配置 ====================

export interface TransformerChainConfig {
  /** 入口转换器：将用户请求转为标准格式 */
  ingress?: string | string[];

  /** 出口转换器：将标准格式转为 Provider 格式 */
  egress?: string | string[];

  /** 响应入口：将 Provider 响应转为标准格式 */
  responseIngress?: string | string[];

  /** 响应出口：将标准响应转为用户协议格式 */
  responseEgress?: string | string[];
}

// ==================== Transformer 注册表 ====================

export interface TransformerRegistry {
  register(name: string, transformer: Transformer | TransformerConstructor): void;
  get(name: string): Transformer | undefined;
  has(name: string): boolean;
  list(): string[];
}

// ==================== 协议检测 ====================

export interface ProtocolDetector {
  detect(request: unknown): ProtocolType | null;
}
