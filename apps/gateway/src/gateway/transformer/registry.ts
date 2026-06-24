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

  clear(): void {
    this.transformers.clear();
  }
}

export const transformerRegistry = new TransformerRegistryImpl();

export const registerTransformer = (name: string, transformer: Transformer | TransformerConstructor) =>
  transformerRegistry.register(name, transformer);

export const getTransformer = (name: string) => transformerRegistry.get(name);

export const hasTransformer = (name: string) => transformerRegistry.has(name);

export const listTransformers = () => transformerRegistry.list();
