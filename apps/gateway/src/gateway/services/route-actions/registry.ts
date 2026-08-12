/**
 * RouteActionHandler 注册表 —— 镜像 apps/gateway/src/gateway/transformer/registry.ts
 * 的 TransformerRegistryImpl 约定，但以单例注册（不像 transformer 那样按需 `new`）：
 * handler 本身不持有请求态，所有请求相关数据都通过 RouteActionResolutionContext
 * 传入，没必要每次 get() 都重新构造一个实例。
 */

import type { RouteActionType } from '@xartifact/x-herald-shared'
import type { RouteActionHandler } from './types'

class RouteActionHandlerRegistryImpl {
  private handlers = new Map<RouteActionType, RouteActionHandler>()

  register(handler: RouteActionHandler): void {
    this.handlers.set(handler.type, handler)
  }

  get(type: RouteActionType): RouteActionHandler | undefined {
    return this.handlers.get(type)
  }

  has(type: RouteActionType): boolean {
    return this.handlers.has(type)
  }

  list(): RouteActionType[] {
    return Array.from(this.handlers.keys())
  }

  clear(): void {
    this.handlers.clear()
  }
}

export const routeActionHandlerRegistry = new RouteActionHandlerRegistryImpl()
