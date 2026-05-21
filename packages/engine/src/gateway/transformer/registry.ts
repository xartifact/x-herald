/**
 * Transformer 注册表
 * 管理所有 Transformer 的注册和获取
 */

import type { Transformer, TransformerConstructor, TransformerRegistry } from '@x-llm-gateway/shared';

class TransformerRegistryImpl implements TransformerRegistry {
  private transformers = new Map<string, Transformer | TransformerConstructor>();

  register(name: string, transformer: Transformer | TransformerConstructor): void {
    this.transformers.set(name, transformer);
  }

  get(name: string): Transformer | undefined {
    const item = this.transformers.get(name);
    if (!item) return undefined;

    // 如果是构造函数，实例化它
    if (typeof item === 'function') {
      return new (item as TransformerConstructor)();
    }

    return item;
  }

  has(name: string): boolean {
    return this.transformers.has(name);
  }

  list(): string[] {
    return Array.from(this.transformers.keys());
  }
}

// 通过 globalThis 共享单例，避免 Turbopack 多 bundle 隔离问题
const g = globalThis as unknown as {
  __xllm_transformerRegistry?: TransformerRegistryImpl;
};
if (!g.__xllm_transformerRegistry) {
  g.__xllm_transformerRegistry = new TransformerRegistryImpl();
}
export const transformerRegistry = g.__xllm_transformerRegistry;

// 便捷导出
export const registerTransformer = (name: string, transformer: Transformer | TransformerConstructor) =>
  transformerRegistry.register(name, transformer);

export const getTransformer = (name: string) => transformerRegistry.get(name);

export const hasTransformer = (name: string) => transformerRegistry.has(name);

export const listTransformers = () => transformerRegistry.list();
