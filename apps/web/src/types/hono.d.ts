import type { VirtualKey } from '@x-llm-gateway/engine';

declare module 'hono' {
  interface ContextVariableMap {
    virtualKey: VirtualKey;
    jwtPayload: unknown;
    user: unknown;
    requestId: string;
  }
}
