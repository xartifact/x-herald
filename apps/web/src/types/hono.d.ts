import type { VirtualKey } from '@x-llm-gateway/database';

declare module 'hono' {
  interface ContextVariableMap {
    virtualKey: VirtualKey;
    jwtPayload: unknown;
    user: unknown;
  }
}
