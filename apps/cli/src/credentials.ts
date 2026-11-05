import { loadCliConfig } from './config'

export interface CredentialInput {
  flagUrl?: string
  flagToken?: string
  flagApiKey?: string
}

export interface ResolvedCredentials {
  baseUrl: string
  /** Admin JWT (or a raw admin password used as bearer). Falls back to the config file. */
  token?: string
  /** Virtual key for /api/v1 proxy endpoints; never sent to admin routes. */
  apiKey?: string
  /** Where the token came from, for `x-herald whoami`. */
  tokenSource?: 'flag' | 'env' | 'config'
}

const DEFAULT_URL = 'http://localhost:3000'

/**
 * Resolve credentials with a three-level fallback: explicit flag, environment
 * variable, then the file written by `x-herald login`.
 *
 * URL follows the same ordering. An empty string is treated as absent so that
 * `--token ""` does not shadow a configured token.
 */
export function resolveCredentials(input: CredentialInput = {}): ResolvedCredentials {
  const stored = loadCliConfig()
  const env = process.env
  const pick = (flag?: string, envValue?: string): string | undefined =>
    [flag, envValue].find((v) => typeof v === 'string' && v.length > 0)

  const flagToken = pick(input.flagToken)
  const envToken = pick(env.X_HERALD_TOKEN)
  const token = flagToken ?? envToken ?? pick(stored.token)
  return {
    baseUrl: pick(input.flagUrl, env.X_HERALD_URL) ?? pick(stored.url) ?? DEFAULT_URL,
    token,
    apiKey: pick(input.flagApiKey, env.X_HERALD_API_KEY),
    tokenSource: flagToken ? 'flag' : envToken ? 'env' : token ? 'config' : undefined,
  }
}
