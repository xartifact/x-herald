import { routeActionHandlerRegistry } from './registry'
import { RejectActionHandler } from './reject-handler'
import { RouteToGroupActionHandler } from './route-to-group-handler'
import { RouteToInstanceActionHandler } from './route-to-instance-handler'
import { IntentActionHandler } from './intent-handler'
import { CapabilityActionHandler } from './capability-handler'
import { FallbackActionHandler } from './fallback-handler'

let registered = false

/**
 * 注册全部内置 RouteActionHandler。幂等——重复调用不会重复注册
 * （Map.set 本身幂等，这里加个 guard 只是避免每次请求都重新 new 一遍实例）。
 *
 * 注意：schema 里的 `route_to_virtual_model` 不在这里注册——它是废弃字段，
 * access-model-router.ts 从未对它做过分发；dispatchAction() 遇到未注册的
 * action.type 会直接抛错，这是它唯一可达的路径。
 */
export function registerDefaultRouteActionHandlers(): void {
  if (registered) return
  routeActionHandlerRegistry.register(new RejectActionHandler())
  routeActionHandlerRegistry.register(new RouteToGroupActionHandler())
  routeActionHandlerRegistry.register(new RouteToInstanceActionHandler())
  routeActionHandlerRegistry.register(new IntentActionHandler())
  routeActionHandlerRegistry.register(new CapabilityActionHandler())
  routeActionHandlerRegistry.register(new FallbackActionHandler())
  registered = true
}

export { routeActionHandlerRegistry } from './registry'
export type {
  RouteActionHandler,
  RouteActionResolutionContext,
  RouteActionDeps,
  LegacyRuleMatch,
} from './types'
