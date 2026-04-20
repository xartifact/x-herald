import type { VirtualKey } from '@/features/keys/db';

declare module 'hono' {
  interface ContextVariableMap {
    virtualKey: VirtualKey;
    jwtPayload: unknown;
    user: unknown;
    requestId: string;
  }
}
