export interface GatewayClientOptions {
  baseUrl?: string
  apiKey?: string
}

export interface Provider {
  id: string
  name: string
  protocols: Record<string, { baseUrl: string; enabled: boolean }>
  apiKey: string
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

export class GatewayClient {
  private baseUrl: string
  private apiKey: string

  constructor(options: GatewayClientOptions = {}) {
    this.baseUrl = options.baseUrl || process.env.XGATE_URL || 'http://localhost:3000'
    this.apiKey = options.apiKey || process.env.XGATE_API_KEY || ''
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`
    const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`API error ${res.status}: ${body}`)
    }
    const json = await res.json()
    // Handle { success: true, data: ... } wrapper
    if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
      return json.data
    }
    return json
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
}
