export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  database?: {
    status: 'connected' | 'disconnected';
  };
}
