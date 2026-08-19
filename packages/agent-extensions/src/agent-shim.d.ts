/**
 * Ambient module declarations for the supported agent runtimes.
 * Each of `@earendil-works/pi-coding-agent`, `@oh-my-pi/pi-coding-agent`,
 * and `prime-agent` (a renamed fork of pi) export the same shape for the
 * surface this extension uses. We declare all three so TypeScript compiles
 * regardless of which runtime is hosting the extension; at runtime, the
 * actual loaded runtime injects the real `pi`.
 */

// Minimal subset of the model config that we send through `pi.registerProvider`.
interface ProviderModelConfig {
  id: string
  name: string
  reasoning: boolean
  input: ('text' | 'image')[]
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number }
  contextWindow: number
  maxTokens: number
  headers?: Record<string, string>
  thinkingLevelMap?: Record<string, string | null>
  compat?: Record<string, unknown>
  [key: string]: unknown
}

interface ProviderConfig {
  name?: string
  baseUrl?: string
  apiKey?: string
  api?: string
  models?: ProviderModelConfig[]
  /**
   * pi (0.83+): called to refresh the model catalogue; the returned list
   * replaces the extension-provided models. Invoked when the model
   * selector opens.
   */
  refreshModels?: (context: { signal?: AbortSignal }) => Promise<ProviderModelConfig[]>
  /**
   * omp: async factory for live model discovery; the result is cached in
   * omp's SQLite model cache (default 24 h TTL). Receives the resolved
   * API key.
   */
  fetchDynamicModels?: (apiKey: string | undefined) => Promise<ProviderModelConfig[]>
  [key: string]: unknown
}

interface ExtensionCommandContext {
  ui: {
    notify(message: string, level?: 'info' | 'warning' | 'error'): void
    setWidget(key: string, content: string[] | undefined): void
    setStatus(key: string, value: string | undefined): void
  }
  cwd: string
  hasUI: boolean
}

interface ExtensionAPI {
  registerProvider(name: string, config: ProviderConfig): void
  unregisterProvider(name: string): void
  registerCommand(
    name: string,
    options: {
      description?: string
      handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void
      getArgumentCompletions?: (
        prefix: string,
      ) => Array<{ value: string; label?: string; description?: string }> | null
    },
  ): void
  on(event: string, handler: (...args: unknown[]) => unknown): void
  sendUserMessage(
    message: string | unknown[],
    options?: { deliverAs?: 'steer' | 'followUp' | 'nextTurn' },
  ): void
}

declare module '@earendil-works/pi-coding-agent' {
  export type { ProviderConfig, ProviderModelConfig, ExtensionAPI, ExtensionCommandContext }
}

declare module '@oh-my-pi/pi-coding-agent' {
  export type { ProviderConfig, ProviderModelConfig, ExtensionAPI, ExtensionCommandContext }
}
declare module 'prime-agent' {
  export type { ProviderConfig, ProviderModelConfig, ExtensionAPI, ExtensionCommandContext }
}
