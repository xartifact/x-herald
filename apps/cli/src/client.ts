export interface GatewayClientOptions {
  baseUrl?: string;
  apiKey?: string;
}

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  protocol: string;
  models: string[];
  enabled: boolean;
}

export interface ModelGroup {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
}

export interface VirtualKey {
  id: string;
  name: string;
  key: string;
  enabled: boolean;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Array<{ name: string; status: string; message?: string }>;
}

export class GatewayClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(options: GatewayClientOptions = {}) {
    this.baseUrl = options.baseUrl || process.env.XGATE_URL || 'http://localhost:3000';
    this.apiKey = options.apiKey || process.env.XGATE_API_KEY || '';
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  // Providers
  async listProviders(): Promise<{ data: Provider[] }> {
    return this.request('/api/providers');
  }

  async getProvider(id: string): Promise<{ data: Provider }> {
    return this.request(`/api/providers/${id}`);
  }

  async createProvider(data: Partial<Provider>): Promise<{ data: Provider }> {
    return this.request('/api/providers', { method: 'POST', body: JSON.stringify(data) });
  }

  async deleteProvider(id: string): Promise<void> {
    await this.request(`/api/providers/${id}`, { method: 'DELETE' });
  }

  // Model Groups
  async listModelGroups(): Promise<{ data: ModelGroup[] }> {
    return this.request('/api/model-groups');
  }

  // Keys
  async listKeys(): Promise<{ data: VirtualKey[] }> {
    return this.request('/api/keys');
  }

  async createKey(data: Partial<VirtualKey>): Promise<{ data: VirtualKey }> {
    return this.request('/api/keys', { method: 'POST', body: JSON.stringify(data) });
  }

  async deleteKey(id: string): Promise<void> {
    await this.request(`/api/keys/${id}`, { method: 'DELETE' });
  }

  // Health
  async getHealth(): Promise<HealthStatus> {
    return this.request('/api/health');
  }
}
