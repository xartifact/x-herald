export interface GatewayClientOptions {
  baseUrl?: string
  /** Admin JWT for /api/* routes. */
  token?: string
  /** Virtual key for /api/v1 proxy routes. */
  apiKey?: string
}

export interface Provider {
  id: string
  name: string
  protocols: Record<string, { baseUrl: string; enabled: boolean }>
  apiKey: string | null
  capabilities?: Record<string, unknown>
  enabled: boolean
}

export interface ModelGroup {
  id: string
  name: string
  description?: string
  enabled: boolean
}

export interface VirtualKey {
  id: string
  name: string
  key: string
  enabled: boolean
}

export interface HealthStatus {
  status: string
  version: string
  uptime: number
  database: string
}

export interface ModelInstance {
  id: string
  name: string
  actualModelName?: string
  providerId?: string
  providerName?: string
  groupIds?: string[]
  description?: string
  config?: Record<string, unknown> | null
  weight?: number
  costPer1kTokens?: unknown
  enabled?: boolean
}

export interface ModelInstanceUpdate {
  providerId?: string
  name?: string
  actualModelName?: string
  description?: string
  weight?: number
  costPer1kTokens?: unknown
  config?: Record<string, unknown> | null
  groupIds?: string[]
  groupId?: string | null
}

export interface RawRequestOptions {
  method: string
  body?: string
  accept?: string
  /** Return the body as text instead of parsing JSON (exports, SSE). */
  asText?: boolean
}

export interface RawResponse {
  status: number
  json: unknown
  text: string
  headers: Headers
}

/** Error carrying the server's status and error code, so callers can act on 404 vs 401. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}

export class GatewayClient {
  private baseUrl: string
  private token: string
  private apiKey: string

  constructor(options: GatewayClientOptions = {}) {
    this.baseUrl = (options.baseUrl || process.env.X_HERALD_URL || 'http://localhost:3000').replace(
      /\/+$/,
      '',
    )
    this.token = options.token || process.env.X_HERALD_TOKEN || ''
    this.apiKey = options.apiKey || process.env.X_HERALD_API_KEY || ''
  }

  /**
   * Issue an arbitrary admin request and return the raw response.
   *
   * Auth precedence is token first, then virtual key: admin routes accept only the
   * JWT, while /api/v1 accepts only the key, and sending both confuses the proxies
   * in between.
   */
  async requestRaw(url: string, options: RawRequestOptions): Promise<RawResponse> {
    const headers: Record<string, string> = {}
    if (options.accept) headers.Accept = options.accept
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    const bearer = this.token || this.apiKey
    if (bearer) headers.Authorization = `Bearer ${bearer}`
    const res = await fetch(url, { method: options.method, headers, body: options.body })
    const text = await res.text()
    if (!res.ok) {
      throw new GatewayError(describeFailure(res.status, text), res.status, errorCode(text))
    }
    if (options.asText) return { status: res.status, json: null, text, headers: res.headers }
    return { status: res.status, json: parseJsonOrText(text), text, headers: res.headers }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await this.requestRaw(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      body: typeof options.body === 'string' ? options.body : undefined,
    })
    if (res.json && typeof res.json === 'object' && 'success' in res.json && 'data' in res.json) {
      return res.json.data as T
    }
    return res.json as T
  }

  async login(password: string): Promise<{ token: string; expiresIn?: number }> {
    return this.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) })
  }

  async whoami(): Promise<{ role: string; iat: number; exp: number }> {
    return this.request('/api/auth/me')
  }

  async listProviders(): Promise<Provider[]> {
    return this.request('/api/providers')
  }
  async getProvider(id: string): Promise<Provider> {
    return this.request(`/api/providers/${id}`)
  }
  async createProvider(data: Partial<Provider>): Promise<Provider> {
    return this.request('/api/providers', { method: 'POST', body: JSON.stringify(data) })
  }
  async deleteProvider(id: string): Promise<void> {
    await this.request(`/api/providers/${id}`, { method: 'DELETE' })
  }
  async listModelGroups(): Promise<ModelGroup[]> {
    return this.request('/api/model-groups')
  }
  async listKeys(): Promise<VirtualKey[]> {
    return this.request('/api/keys')
  }
  async createKey(data: Partial<VirtualKey>): Promise<VirtualKey> {
    return this.request('/api/keys', { method: 'POST', body: JSON.stringify(data) })
  }
  async deleteKey(id: string): Promise<void> {
    await this.request(`/api/keys/${id}`, { method: 'DELETE' })
  }
  async getHealth(): Promise<HealthStatus> {
    return this.request('/api/health')
  }

  async listInstances(): Promise<ModelInstance[]> {
    return this.request('/api/model-groups/instances')
  }
  async updateInstance(id: string, data: Partial<ModelInstanceUpdate>): Promise<ModelInstance> {
    return this.request(`/api/model-groups/instances/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }
}

function parseJsonOrText(text: string): unknown {
  if (text.length === 0) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function errorCode(text: string): string | undefined {
  const parsed = parseJsonOrText(text)
  if (parsed && typeof parsed === 'object' && 'code' in parsed && typeof parsed.code === 'string') {
    return parsed.code
  }
  return undefined
}

/** Turn a failed response into one actionable line, keeping the server's own message. */
function describeFailure(status: number, text: string): string {
  const parsed = parseJsonOrText(text)
  const detail =
    parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string'
      ? parsed.error
      : text.slice(0, 500)
  const hint =
    status === 401
      ? ' (run `x-herald login` or pass --token)'
      : status === 403
        ? ' (forbidden: check token role or workspace)'
        : ''
  return `HTTP ${status}: ${detail || 'request failed'}${hint}`
}
